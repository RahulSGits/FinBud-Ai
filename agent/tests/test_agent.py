"""Tests for the FinBud worker's pure logic.

Deliberately free of network and API keys: these cover prompt assembly, job
metadata parsing, transcript formatting and the analysis short-circuits, all of
which decide what ends up in the customer's call record. The LLM-judged
behavioural evals that ship with the LiveKit starter are a separate concern and
need live credentials, so they are not run here.
"""

from __future__ import annotations

import json

import pytest

from finbud.config import VOICE_OUTPUT_RULES, AgentConfig, CallContext, FinBudClient
from finbud.reporting import FALLBACK_ANALYSIS, analyse_call, format_transcript

# ---------------------------------------------------------------------------
# CallContext
# ---------------------------------------------------------------------------


def test_call_context_parses_dispatcher_metadata() -> None:
    raw = json.dumps(
        {
            "callLogId": "call-1",
            "agentId": "agent-1",
            "contactId": "contact-1",
            "campaignId": "campaign-1",
            "customerName": "Rahul Sharma",
            "customerPhone": "+919812345001",
        }
    )
    ctx = CallContext.from_metadata(raw)

    assert ctx.call_log_id == "call-1"
    assert ctx.agent_id == "agent-1"
    assert ctx.contact_id == "contact-1"
    assert ctx.campaign_id == "campaign-1"
    assert ctx.customer_name == "Rahul Sharma"
    assert ctx.customer_phone == "+919812345001"


@pytest.mark.parametrize("raw", [None, "", "not json"])
def test_call_context_survives_unusable_metadata(raw: str | None) -> None:
    """A malformed dispatch must not crash the worker mid-call."""
    ctx = CallContext.from_metadata(raw)
    assert ctx.call_log_id is None
    assert ctx.agent_id is None


# ---------------------------------------------------------------------------
# AgentConfig
# ---------------------------------------------------------------------------


def test_agent_config_maps_the_backend_payload() -> None:
    config = AgentConfig.from_api(
        {
            "agentId": "agent-1",
            "name": "Home Loan Qualifier",
            "firstMessage": "Hello {{customer_name}}",
            "systemPrompt": "You are Priya.",
            "sections": [
                {"title": "Call objective", "body": "Book a callback."},
                {"title": "Empty", "body": "   "},
            ],
            "llmModel": "openai/gpt-4o",
            "sttModel": "deepgram/nova-3",
            "ttsModel": "cartesia/sonic-3",
            "voiceId": "voice-abc",
            "language": "hi",
            "transferEnabled": True,
            "transferNumber": "+911140000000",
        }
    )

    assert config.agent_id == "agent-1"
    assert config.name == "Home Loan Qualifier"
    assert config.llm_model == "openai/gpt-4o"
    assert config.tts_voice == "voice-abc"
    assert config.language == "hi"
    assert config.transfer_enabled is True
    assert config.transfer_number == "+911140000000"
    # Blank sections are dropped so they cannot open an empty heading in the prompt.
    assert [s.title for s in config.sections] == ["Call objective"]


def test_agent_config_falls_back_to_defaults_on_nulls() -> None:
    """The backend sends null for unset columns; those must not overwrite defaults."""
    config = AgentConfig.from_api(
        {"agentId": "agent-1", "llmModel": None, "language": None, "sections": None}
    )

    assert config.llm_model == "openai/gpt-4o-mini"
    assert config.stt_model == "deepgram/nova-3"
    assert config.language == "multi"
    assert config.sections == []


def test_build_instructions_flattens_sections_and_appends_voice_rules() -> None:
    config = AgentConfig.from_api(
        {
            "agentId": "agent-1",
            "systemPrompt": "You are Priya.",
            "sections": [
                {"title": "Business context", "body": "Finance Buddha arranges loans."},
                {"title": "Closing", "body": "Thank them and end."},
            ],
        }
    )
    instructions = config.build_instructions()

    assert instructions.startswith("You are Priya.")
    assert "## Business context\nFinance Buddha arranges loans." in instructions
    assert "## Closing\nThank them and end." in instructions
    # Every agent gets the TTS-medium rules, whatever the author wrote.
    assert VOICE_OUTPUT_RULES in instructions
    assert instructions.index("## Business context") < instructions.index("## Closing")


def test_build_instructions_still_produces_a_usable_prompt_when_empty() -> None:
    instructions = AgentConfig(agent_id="agent-1").build_instructions()
    assert "helpful AI voice assistant" in instructions
    assert VOICE_OUTPUT_RULES in instructions


# ---------------------------------------------------------------------------
# FinBudClient
# ---------------------------------------------------------------------------


def test_client_reports_unconfigured_without_both_halves() -> None:
    assert FinBudClient(base_url="", secret="").configured is False
    assert FinBudClient(base_url="http://localhost:3000", secret="").configured is False
    assert FinBudClient(base_url="", secret="shh").configured is False
    assert FinBudClient(base_url="http://localhost:3000", secret="shh").configured is True


def test_client_strips_the_trailing_slash_from_the_base_url() -> None:
    """Otherwise every request URL would contain a double slash."""
    client = FinBudClient(base_url="http://localhost:3000/", secret="shh")
    assert client.base_url == "http://localhost:3000"


def test_client_sends_the_shared_secret_header() -> None:
    headers = FinBudClient(base_url="http://x", secret="shh")._headers()
    assert headers["x-internal-secret"] == "shh"
    assert headers["Content-Type"] == "application/json"


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def test_format_transcript_labels_each_side() -> None:
    turns = [
        {"role": "assistant", "text": "Hello, is now a good time?"},
        {"role": "user", "text": "Yes, speaking."},
    ]
    assert format_transcript(turns) == (
        "Agent: Hello, is now a good time?\nCustomer: Yes, speaking."
    )


def test_format_transcript_handles_an_empty_call() -> None:
    assert format_transcript([]) == ""


async def test_analyse_call_reports_no_answer_when_nothing_was_said() -> None:
    result = await analyse_call([], model="openai/gpt-4o-mini")
    assert result["lead_status"] == "no_answer"
    assert result["interested"] is False
    assert result["lead_score"] == 0


async def test_analyse_call_reports_no_answer_when_only_the_agent_spoke() -> None:
    """Ringing out and monologuing into voicemail is not an engaged lead.

    This short-circuits before any LLM call, which is also why the test needs no
    credentials.
    """
    turns = [
        {"role": "assistant", "text": "Hello, this is Priya from Finance Buddha."},
        {"role": "assistant", "text": "I will try again later."},
    ]
    result = await analyse_call(turns, model="openai/gpt-4o-mini")

    assert result["lead_status"] == "no_answer"
    assert result["interested"] is False
    assert "never responded" in result["summary"]


def test_fallback_analysis_covers_every_key_the_backend_reads() -> None:
    """A partial LLM response is merged over this, so it must be complete."""
    assert set(FALLBACK_ANALYSIS) == {
        "summary",
        "interested",
        "lead_status",
        "customer_intent",
        "next_action",
        "objections",
        "lead_score",
    }
