"""FinBud AI — LiveKit voice agent worker.

Runs as a long-lived worker process that receives job dispatches from LiveKit.
Each job carries metadata identifying which FinBud agent to run and which call
log to report against, so one worker serves every agent in the platform.

Run locally:
    uv run python src/agent.py console     # talk to it in your terminal
    uv run python src/agent.py dev         # connect to LiveKit and wait for jobs
"""

import logging
import time

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    TurnHandlingOptions,
    cli,
    inference,
    room_io,
)
from livekit.plugins import ai_coustics

from finbud.config import AgentConfig, CallContext, FinBudClient
from finbud.reporting import summarise_and_report

logger = logging.getLogger("agent")

load_dotenv(".env.local")

# Used when the backend is unreachable or the job carries no agent id, so a
# misconfigured dispatch still produces a coherent call rather than silence.
FALLBACK_INSTRUCTIONS = """\
You are a professional voice assistant calling on behalf of Finance Buddha.
Introduce yourself, confirm you are speaking to the right person, and ask
whether they are interested in discussing loan options. Keep it brief and
respect any request to end the call.
"""


class FinBudAgent(Agent):
    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)


server = AgentServer()


@server.rtc_session(agent_name="finbud-agent")
async def finbud_agent(ctx: JobContext):
    call_ctx = CallContext.from_metadata(ctx.job.metadata)

    ctx.log_context_fields = {
        "room": ctx.room.name,
        "call_log_id": call_ctx.call_log_id,
        "agent_id": call_ctx.agent_id,
        "campaign_id": call_ctx.campaign_id,
    }

    client = FinBudClient()

    config: AgentConfig | None = None
    if call_ctx.agent_id:
        config = await client.fetch_agent_config(call_ctx.agent_id)

    if config is None:
        logger.warning("running with fallback configuration")
        config = AgentConfig(agent_id=call_ctx.agent_id or "unknown")
        instructions = FALLBACK_INSTRUCTIONS
    else:
        instructions = config.build_instructions()

    # Personalise the greeting when the dispatcher supplied a contact name.
    greeting = config.first_message
    if greeting and call_ctx.customer_name:
        greeting = greeting.replace("{{customer_name}}", call_ctx.customer_name)

    session = AgentSession(
        stt=inference.STT(model=config.stt_model, language=config.language),
        llm=inference.LLM(model=config.llm_model),
        tts=inference.TTS(
            model=config.tts_model,
            **({"voice": config.tts_voice} if config.tts_voice else {}),
        ),
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
        ),
        preemptive_generation=True,
    )

    # Register the end-of-call hook before starting, so a call that drops
    # immediately is still reported. started_at is captured here rather than
    # inside the hook: without it every report would claim a zero-second call,
    # and the dashboard treats duration > 0 as "the customer answered".
    started_at = time.time()
    ctx.add_shutdown_callback(
        lambda: summarise_and_report(
            session=session,
            call_ctx=call_ctx,
            config=config,
            client=client,
            started_at=started_at,
        )
    )

    await session.start(
        agent=FinBudAgent(instructions),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=ai_coustics.audio_enhancement(
                    model=ai_coustics.EnhancerModel.QUAIL_VF_S
                ),
            ),
        ),
    )

    await ctx.connect()

    # Speak first on outbound calls — the customer answered, they are waiting.
    if greeting:
        await session.say(greeting, allow_interruptions=True)


if __name__ == "__main__":
    cli.run_app(server)
