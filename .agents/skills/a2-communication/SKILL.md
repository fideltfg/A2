---
name: a2-communication
description: 'Use A2 for validated AI-to-AI communication when structured meaning, repeated exchanges, deterministic decoding, or lower transport/token cost matter. Use when choosing between A2 and natural language, encoding or decoding A2 frames, designing agent handoffs, plans, status messages, event graphs, vocabulary manifests, or machine-readable protocols.'
argument-hint: 'Describe the agent exchange or message that may benefit from A2.'
---

# A2 Communication

Use A2 as a machine-to-machine communication format, not as a replacement for all language. A2 is useful when the receiver is another agent or program and the message contains repeated, structured fields such as intent, state, confidence, recipients, risks, dependencies, deadlines, requests, plans, or event relations.

The normative protocol rules are in [SPEC.md](../../../SPEC.md), the reusable agent behavior is in [AGENT_PROMPT.md](../../../AGENT_PROMPT.md), and the implementation is in [codec.mjs](../../../codec.mjs).

## Decide Whether A2 Is Appropriate

Choose A2 when most of these are true:

- The recipient is an agent, service, queue, router, or validator rather than a human reader.
- The exchange has a stable schema or repeated vocabulary.
- The receiver benefits from rejecting unknown, incomplete, or ambiguous meaning.
- The message carries explicit intent, lifecycle state, confidence, risk, dependencies, or structured relations.
- A vocabulary can be shared, cached, or embedded.
- The exchange is frequent enough for a vocabulary bootstrap to be amortized.

Prefer natural language when any of these dominate:

- A human is the primary reader or decision-maker.
- The content is exploratory, persuasive, emotional, ambiguous, or open-ended.
- The exchange is a one-off short message where a full vocabulary manifest would cost more than the payload.
- The receiver needs prose nuance that has no agreed A2 vocabulary.
- The message is a prompt for a model and exact machine semantics are not required.

A2 is not automatically cheaper. Compare the actual encoded byte or token size, including the first full vocabulary manifest. For repeated conversations, use one full bootstrap followed by reference manifests; use delta manifests only when adding concepts.

## Message Workflow

1. Identify the communication act: inform (`in`), propose a plan (`pl`), request an action (`rq`), report status (`rs`), confirm (`cf`), deny (`dn`), ask a question (`qs`), or raise an alert (`al`).
2. Select an explicit lifecycle state, confidence, goal, recipients, and risk when they matter.
3. Use registered vocabulary symbols for repeated semantic concepts. Use a bracketed literal only when the vocabulary cannot express the value.
4. Represent plan steps, ordering dependencies, guards, and completion conditions explicitly. Do not infer executors from recipients.
5. Embed a full vocabulary for first contact. For synchronized sessions, use a reference or delta manifest whose hash is verified by the receiver.
6. Validate before sending and decode before routing, displaying, or acting on a message.
7. Render with `toEnglish()` for logs, audits, and human review, while treating the encoded fields and ontology references as authoritative.
8. Keep authorization, tool selection, safety checks, and completion verification in the host application. A valid A2 frame is not proof, permission, or evidence that work happened.

## Required Semantic Boundaries

Preserve these distinctions:

- Sender confidence is not truth probability or evidence.
- A request or proposal does not mean the action occurred.
- A recipient is not automatically a step executor.
- A dependency specifies ordering, not data flow or causation.
- A `when` guard and `ok` condition are sender assertions, not independently verified facts.
- An event-graph causal edge is a claimed relation, not proof of causation.
- An omitted field is unspecified, not false, empty, zero, or irrelevant.
- Vocabulary display text is for rendering; namespace-qualified references define domain meaning.

Reject unknown codes, invalid manifests, incompatible vocabulary revisions, duplicate fields, unresolved references, and cyclic dependencies. Never guess a missing concept from its spelling or gloss.

## Exchange Patterns

For a plan handoff, encode:

- `i: "pl"`, a confidence value, `s: "new"`, a goal concept, risk, and requested response.
- Ordered `st` steps with action, subject, optional executor, dependency, guard, and completion condition.
- A message dependency when the plan relates to an earlier message.

For a request, use `i: "rq"` and an explicit `ask`; do not encode it as a completed state unless the sender is reporting verified completion.

For a response, use a new message ID and preserve the original sender as the recipient. Choose `rs`, `cf`, `dn`, `qs`, or `al` according to the actual communication act, and include only evidence the host independently supports.

For richer narratives, use `eg` with explicit entities, ontology-backed predicates, roles, quotations, possession, and causal claims. Use event graphs only when the extra structure is needed; a simple goal and plan is cheaper.

## Validation Checklist

Before sending:

- Confirm the protocol version is A2 and all required fields are present.
- Confirm every symbol is defined in the selected vocabulary.
- Confirm the vocabulary mode, hash, and cache requirements are valid.
- Confirm list values, routes, literals, numeric results, and identifiers are canonical.
- Confirm step dependencies resolve and are acyclic.
- Confirm event-graph roles and references resolve.
- Run the repository tests when changing the codec or vocabulary: `npm test` from the A2 project, or the project’s supported Node container if host Node is unavailable.

After receiving:

- Decode and validate before showing the message to a model or sending it to a tool.
- Audit the decoded message and its human rendering.
- Apply local policy, authorization, sandboxing, and approval gates independently.
- Verify completion independently before emitting `ok` or `cf`.
- Fall back to a human-readable explanation when the recipient is a person or when A2 cannot express the needed nuance.

## Output Discipline

When A2 is selected, send exactly one UTF-8 frame per line. Do not wrap the frame in Markdown, add commentary to the transport line, or silently translate unknown symbols. In a mixed human/agent workflow, keep the A2 frame for the machine channel and provide a separate `toEnglish()` rendering for the human channel.
