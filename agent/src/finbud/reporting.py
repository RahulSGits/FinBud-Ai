"""End-of-call transcript capture, summarisation and lead qualification.

Managed platforms like Vapi return a finished "end of call report" containing a
summary and success evaluation. LiveKit gives you the raw conversation instead,
so this module reproduces that step: it reads the session history, asks an LLM
for a structured verdict, and posts the result to the FinBud backend.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from livekit.agents import AgentSession, ChatContext, inference

from .config import AgentConfig, CallContext, FinBudClient

logger = logging.getLogger("finbud.reporting")

# Kept small and rigid: the output is parsed, not read by a human.
ANALYSIS_PROMPT = """\
You are analysing a completed outbound sales call for a lending company.
Read the transcript and reply with ONLY a JSON object, no prose, using exactly
these keys:

{
  "summary": "2-3 sentence factual summary of what was said",
  "interested": true or false,
  "lead_status": one of "interested", "not_interested", "callback_requested", "no_answer", "voicemail",
  "customer_intent": short snake_case label or null,
  "next_action": one of "schedule_callback", "send_details", "do_not_contact", "retry_later", "none",
  "objections": short snake_case label or null,
  "lead_score": integer 0-100 reflecting likelihood to convert
}

Base every field strictly on the transcript. If the customer never spoke,
use lead_status "no_answer", interested false and lead_score 0.
"""

FALLBACK_ANALYSIS: dict[str, Any] = {
    "summary": "Call completed. Automatic analysis was unavailable.",
    "interested": False,
    "lead_status": "unknown",
    "customer_intent": None,
    "next_action": "none",
    "objections": None,
    "lead_score": 0,
}


def extract_transcript(session: AgentSession) -> list[dict[str, str]]:
    """Flatten the session history into role/text turns."""
    turns: list[dict[str, str]] = []
    try:
        history = session.history
    except Exception:
        logger.exception("could not read session history")
        return turns

    for item in getattr(history, "items", []) or []:
        role = getattr(item, "role", None)
        if role not in ("user", "assistant"):
            continue

        content = getattr(item, "content", None)
        if isinstance(content, list):
            text = " ".join(c for c in content if isinstance(c, str)).strip()
        else:
            text = str(content or "").strip()

        if text:
            turns.append({"role": role, "text": text})

    return turns


def format_transcript(turns: list[dict[str, str]]) -> str:
    return "\n".join(
        f"{'Customer' if t['role'] == 'user' else 'Agent'}: {t['text']}" for t in turns
    )


async def analyse_call(turns: list[dict[str, str]], model: str) -> dict[str, Any]:
    """Ask an LLM to summarise and qualify the call."""
    if not turns:
        return {**FALLBACK_ANALYSIS, "lead_status": "no_answer"}

    # Nothing the customer said means nobody engaged, regardless of what the
    # agent broadcast into the void.
    if not any(t["role"] == "user" for t in turns):
        return {
            **FALLBACK_ANALYSIS,
            "summary": "The agent spoke but the customer never responded.",
            "lead_status": "no_answer",
        }

    try:
        llm = inference.LLM(model=model)
        chat_ctx = ChatContext()
        chat_ctx.add_message(role="system", content=ANALYSIS_PROMPT)
        chat_ctx.add_message(role="user", content=format_transcript(turns))

        raw = ""
        async with llm.chat(chat_ctx=chat_ctx) as stream:
            async for chunk in stream:
                delta = getattr(chunk, "delta", None)
                if delta and getattr(delta, "content", None):
                    raw += delta.content

        raw = raw.strip()
        # Models often wrap JSON in a fenced block despite instructions.
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end == -1:
            raise ValueError(f"no JSON object in analysis output: {raw[:120]}")

        parsed = json.loads(raw[start : end + 1])
        return {**FALLBACK_ANALYSIS, **parsed}

    except Exception:
        logger.exception("call analysis failed; falling back")
        return dict(FALLBACK_ANALYSIS)


async def summarise_and_report(
    session: AgentSession,
    call_ctx: CallContext,
    config: AgentConfig,
    client: FinBudClient,
    started_at: float | None = None,
) -> None:
    """Shutdown hook: capture, analyse and deliver the call result."""
    if not call_ctx.call_log_id:
        logger.info("no callLogId in job metadata; nothing to report")
        return

    turns = extract_transcript(session)
    analysis = await analyse_call(turns, config.llm_model)

    duration = int(time.time() - started_at) if started_at else 0

    payload = {
        "callLogId": call_ctx.call_log_id,
        "agentId": call_ctx.agent_id,
        "contactId": call_ctx.contact_id,
        "campaignId": call_ctx.campaign_id,
        "durationSec": duration,
        "transcript": turns,
        "transcriptText": format_transcript(turns),
        "summary": analysis.get("summary"),
        "interested": bool(analysis.get("interested")),
        "leadStatus": analysis.get("lead_status"),
        "customerIntent": analysis.get("customer_intent"),
        "nextAction": analysis.get("next_action"),
        "objections": analysis.get("objections"),
        "leadScore": analysis.get("lead_score"),
    }

    logger.info(
        "reporting call %s: status=%s interested=%s turns=%d",
        call_ctx.call_log_id,
        payload["leadStatus"],
        payload["interested"],
        len(turns),
    )
    await client.report_call(payload)
