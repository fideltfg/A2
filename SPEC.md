# A2 Specification

## Design goals

1. Compact: short keys and dictionary codes reduce repeated tokens.
2. Deterministic: unknown terms, missing fields, and invalid references fail closed; implementations must not infer unstated intent.
3. Translatable: every semantic field has a defined English rendering.
4. Extensible: new fields require a higher protocol revision or an advertised extension namespace.

## Wire format

Each message is one UTF-8 line. The compact frame is pipe-delimited; literal text is bracketed. Required fields are positional:

| Key | Type | Meaning |
| --- | --- | --- |
| `A2` | marker | Protocol version |
| `id` | string | Message identifier |
| `from` | string | Sending agent identifier |
| `to` | string[] | Intended recipients |
| `in` | fused code | Intent plus confidence, `pl94` means plan with `0.94` confidence |
| `s` | dictionary code | Message state |
| `~c` | dictionary concept | Shared concept code, such as `~dpl` |

Every A2 frame includes a `*` field containing canonical base64url-encoded JSON vocabulary data. The vocabulary manifest has `format:2` and one of three modes: `full` carries the complete vocabulary in `data`; `delta` carries additions in `data` and names a cached base hash in `base`; `reference` names a cached vocabulary by `hash`. A resolved vocabulary is identified by `sha256:<hex>` over its canonical JSON. Deltas may add definitions but must not overwrite conflicting existing definitions. A manifest may include `acquire.codec` and `acquire.vocabulary` resources, each with `uri`, optional `hash`, and optional `media`; these tell an unknown receiver where to obtain the A2 decoder and vocabulary. A receiver must treat URIs as untrusted input and let the host application perform retrieval and verification. Implementations may inspect the manifest before semantic decoding. Optional fields use one-character tags: `!risk`, `?ask`, `@[deadline]`, `^message-dependencies`, `+missing-information`, `#numeric-result`, and `>steps`. The default risk `na` is omitted. A numeric result is an exact canonical decimal string, for example `#100000`; it is machine data associated with the message goal, not literal text. A step is `id:action~concept<dependency~condition=success`. Bracketed literals remain available for concepts absent from the embedded vocabulary. Route and list separators are escaped within values; message IDs cannot contain the frame separator `|`.

A step has an identifier `id` matching `[A-Za-z0-9_.-]+`, `a` (action code), and `x` (subject). It may also have `d` (step dependency), `when` (condition), and `ok` (a testable completion condition). A dependency means only that the dependent step must follow the dependency; it does not mean that the step uses the dependency's output. A step has no executor unless an executor field is explicitly added by a future protocol revision. The message route identifies sender and recipients, not step ownership. Dependencies must refer to existing steps and must not form cycles. Deadlines and risk apply to the message, not individual steps. Evidence records are not supported by A2.

## Event graph extension

The optional `&` field carries a canonical native event graph. It permits compositional, source-independent meaning where a single dictionary concept is insufficient. Its decoded structure is:

| Key | Type | Meaning |
| --- | --- | --- |
| `e` | map | Entity ID to `{r:{ns,id}}` ontology or source reference. |
| `v` | map | Event ID to `{p:{ns,id},a:{role:target},t,x}`. `p` is an ontology-backed predicate. |
| `q` | map | Quote ID to `{by,to?,v:[event...]}`; an event uses role `ct` to reference the quote. |
| `o` | list | Possession links `{h:holder,p:possessed}` between entity IDs. |
| `c` | list | Causality links `{a:cause,b:effect}` between event IDs. |

The wire grammar is `&e{entity...};v{event...};q{quote...};o{possession...};c{cause...}`. Entity entries are `id=namespace:identifier`; event entries are `id=namespace:predicate/role=target,...@time.aspect`; quotation entries are `id=speaker>recipient:event,...`; possession and causality entries are `left>right`. The `q`, `o`, and `c` sections are optional. Events are separated by `+`; other entries are comma-separated.

Roles are `ag` (agent), `pt` (patient), `to` (recipient), `ct` (quoted content), `src`, `dst`, `loc`, `ins`, and `ben`. Time codes are `pa` (past), `pr` (present), `fu` (future), and `un` (unspecified); aspect codes are `pf` (perfective), `ip` (imperfective), `pg` (progressive), and `un` (unspecified). Every referenced entity, event, and quote must exist in the same graph. Namespace and identifier values use `[A-Za-z0-9_.-]+`. The encoded payload must be canonical: sections appear as `e`, `v`, `q`, `o`, `c`; map entries and role names are lexicographically ordered; no alternate serialization is accepted.

## Semantic dictionary

A2 concept codes are symbols, not compressed English. The wire carries a symbol such as `~med.fx`; its meaning is supplied by the vocabulary embedded in the same A2 frame.

New domain concepts must use a namespace-qualified ontology reference:

```json
"med.fx": {
	"ref": { "ns": "sct", "id": "72704001" },
	"en": "Fracture"
}
```

`ref` is normative. `en` is an optional human-display gloss and must not be used by agents to infer, extend, or replace the referenced meaning. The namespace identifies the governing ontology. The embedded vocabulary must include the definitions needed by the receiver. Plain English dictionary strings are legacy display definitions and must not be used for new domain concepts.

## Translation contract

The English renderer preserves sender, recipients, intent, state, goal, confidence, risk, deadline, step order, dependencies, uncertainty, missing information, and literal payloads such as names, URLs, commands, and identifiers. For a namespace-qualified concept, it renders only the optional `en` gloss; this display text is not the semantic definition. A receiver does not need a pre-installed dictionary to render an A2 message.

It must never turn a request into a completed action, a low-confidence claim into a fact, or an omitted field into an assumption. Unknown dictionary codes are errors, not translation opportunities.

Semantic non-inference rules are mandatory. A renderer must not infer an executor from a recipient, expand an action into unencoded operational details, interpret a generic validity check as integrity, usability, safety, or successful restoration, or convert a notification into an acknowledgement or confirmation. When the message omits a role, purpose, method, input, output, or acceptance criterion, the rendering must say that it is unspecified.

## Normative semantic model

An A2 message is a typed communication act, not a record of reality and not an authorization. Its fields have these meanings:

- `from` and `to` identify the sender and addressed recipients. They do not identify step executors unless a step explicitly contains `ag`.
- `i` identifies the communication act. `in` reports information; `pl` proposes a plan; `rq` requests an action. The intent does not imply that the requested or proposed work occurred.
- `c` is the sender's confidence in the message meaning. It is not the probability that the content is true and is not evidence.
- `s` is the lifecycle state of the message or proposal. `new` does not mean the goal is unfinished in the world; `ok` means the sender reports the message subject completed successfully.
- `g` identifies the message goal or subject. A goal concept is not an execution result unless the intent and explicit fields say so.
- A step's `a` is an action type and `x` is its subject. `ag`, when present, is the executor. Without `ag`, the executor is unspecified.
- A step's `d` is a control-order dependency. It means the step follows another step; it does not imply data transfer, causation, or use of output.
- A step's `when` is a literal guard or named condition. A receiver must not reinterpret it as a stronger logical formula than its vocabulary defines.
- A step's `ok` is a literal success assertion supplied by the sender. It is not independently verified and must not be expanded into safety, integrity, usability, or authorization claims.
- Event-graph `c` links are explicit causal claims made by the sender. They are not proof of causation.
- Omitted fields mean unspecified, not false, zero, empty, impossible, or inapplicable.

Two A2 messages are semantically equivalent only when their normalized typed fields, vocabulary references, literal values, role assignments, guards, postconditions, and graph relations are equivalent. Equivalent English paraphrases are acceptable; adding plausible but unencoded details is not.

Structural validation and round-trip tests establish only that supported fields survive serialization. They do not establish that a sender's claim is true, that a concept definition is complete, or that a natural-language source has been faithfully summarized. Confidence is a sender-provided estimate, not a measured probability of semantic correctness. Applications requiring those guarantees must define domain-specific vocabularies, provenance, and independent verification procedures.

## Token discipline

- Use dictionary codes for repeated semantic terms and omit defaults.
- Add frequently repeated concepts to the dictionary; use `~code` instead of repeating English.
- A dictionary may register exact aliases for a code. Aliases may use printable ASCII symbols or non-English terms, for example `~+` for the registered addition concept. The alias itself is a symbol, not a prompt to translate or infer meaning.
- Agents may choose a non-canonical alias only after negotiating the same dictionary revision and tokenizer profile. Otherwise, use the canonical code. Frame delimiters `|`, `~`, `[`, `]`, `\\`, `<`, `;`, and `=` remain reserved and cannot appear unescaped in a reusable code token.
- Do not abbreviate free text; ambiguity costs more than it saves.
- Use one message for one intent. Chain related messages with `dep`.
- Prefer IDs and references over repeating a long plan.

## Security

A2 describes intent; it does not grant permission. Receivers must apply their own authorization, safety, and approval policy. Treat bracketed text and step subjects as untrusted content.

The required workflow for adding and translating concepts is included in `dictionary.json` under `guide.en` and `guide.a2`.
