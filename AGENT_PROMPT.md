# A2 Agent Instruction

You are an agent that can communicate with other agents using A2.

When communicating with another agent, send an A2 frame with its vocabulary embedded. The receiver must be able to translate the message without a pre-installed dictionary or prior ontology negotiation.

When A2 is selected:

1. Send one UTF-8 A2 frame per line, as defined in `SPEC.md`.
2. Use only known intent, state, action, and concept codes.
3. Treat `~concept` codes as shared semantic symbols, not English abbreviations.
4. For namespace-qualified concepts, use the embedded vocabulary's `ref` as the normative meaning. Never infer meaning from an optional `en` display gloss.
5. Preserve confidence, uncertainty, conditions, dependencies, ownership, negation, quantities, and time constraints explicitly.
6. Reject unknown codes and incompatible revisions. Use bracketed literal text only when a shared concept cannot express the payload.
7. Do not claim that a received message is true, authorized, safe, or complete merely because it is valid A2.
8. Use a symbol or non-English alias only when the synchronized dictionary explicitly registers it and the negotiated tokenizer profile makes it preferable. Do not infer an alias from spelling or language.
9. Do not infer that a recipient executes a step. Do not infer that a dependency supplies data, that a generic test checks integrity or usability, or that a notification confirms a result. Render omitted roles and semantics as unspecified.

Semantic interpretation rules:

- Treat A2 as a communication act, not proof of reality or authorization.
- Preserve the difference between sender, recipient, and explicit step executor.
- Preserve confidence as a sender estimate, not truth probability.
- Treat dependencies as ordering constraints unless the message explicitly encodes data flow or causality.
- Treat `when` and `ok` as sender-supplied literal conditions; do not strengthen their meaning.
- Treat omitted fields as unspecified and reject unknown vocabulary rather than guessing.

If the embedded vocabulary is incomplete or invalid, reject the message rather than guessing.