# A2

A2 is a compact, deterministic interchange language for AI agents. It carries ideas, status, requests, plans, and event graphs without requiring agents to negotiate their meaning through an ordinary-language conversation.
A2 also supports typed step-outcome guards, ontology-backed quantities, and conditional prohibitions.

An A2 message is a typed communication act. It says what the sender asserts, requests, or proposes; it is not proof that a claim is true, that work happened, or that an action is authorized.

## Why use A2?

Natural language is useful at the human boundary, but it leaves important operational details open to interpretation. A2 makes the details an agent needs to preserve explicit:

- **Deterministic interpretation.** Required fields, known codes, and canonical serialization are validated. Unknown codes and incompatible vocabulary revisions fail closed rather than being guessed.
- **Compact transport.** Short keys and shared vocabulary codes reduce repeated text, tokens, and bandwidth while keeping the vocabulary needed to decode a message with the message itself.
- **Clear agent handoffs.** Sender, recipients, intent, state, confidence, goal, risks, dependencies, deadlines, and requested response are separate fields instead of implications in prose.
- **Auditable meaning.** `toEnglish()` produces a human-readable rendering that preserves the encoded intent and uncertainty. An optional English gloss is for display; the code or ontology reference remains the semantic definition.
- **Composable plans.** A message can contain ordered steps, explicit control dependencies, guards, and sender-provided completion conditions.
- **Domain precision.** Concepts can point to namespace-qualified ontology identifiers, such as a SNOMED CT reference, rather than relying on ambiguous words.
- **Portable bootstrapping.** A full vocabulary manifest lets a new receiver decode a message without a pre-installed dictionary. Delta and reference modes support efficient long-lived agent conversations.
- **Structured narratives.** The optional event graph represents entities, events, roles, quotations, possession, and causal assertions when a single goal concept is not enough.

## What A2 does not do

Keep this boundary in the surrounding agent system:

- A valid A2 frame does **not** prove truth, provenance, completion, safety, or authorization.
- `c` is the sender's confidence in the message meaning, not a measured probability that the content is true.
- `to` names message recipients, not step executors. An executor is unspecified unless it is explicitly represented by the step or event data.
- A step dependency means ordering only. It does not transfer output, imply causation, or define data flow.
- A `when` guard and `ok` condition are sender assertions. Validate them independently before acting.
- Bracketed literal text, URLs, commands, and step subjects are untrusted input. Apply the same policy, sandboxing, approval, and authorization checks used for any external instruction.

A2 is therefore a communication layer, not an execution or security layer.

## Install and test

This repository uses Node.js 20 or newer and has no runtime dependency installation step.

```bash
npm test
```

## The A2 frame

An A2 message is one UTF-8 line with pipe-delimited fields. A compact wire frame begins like this:

```text
A2|deploy-42|planner>worker|pl94|new|[deploy the service]|*...|!lo|?run|>s1:inspect[service health];s2:restart[the service]<s1
```

The `*...` field is a canonical base64url vocabulary manifest. A2 requires it; the receiver does not need to guess what `inspect` or any registered concept means. Literal goals and subjects are bracketed until an ontology-backed concept is available.

| Field | Meaning |
| --- | --- |
| `A2` | Protocol marker and revision. |
| `id` | Message identifier. |
| `from>to` | Sender and one or more intended recipients. |
| `in` | Intent and confidence, for example `pl94` is a plan with $0.94$ sender confidence. |
| `s` | Message lifecycle state. |
| `~concept` | Goal or subject concept from the resolved vocabulary. |
| `*manifest` | Full, delta, or reference vocabulary manifest. |
| `!risk` | Optional risk assessment. |
| `?ask` | Optional requested response or action. |
| `>steps` | Optional ordered plan steps. |

Other optional A2 fields carry a deadline, related-message dependencies, missing information, an exact numeric result, and an event graph. Read [SPEC.md](SPEC.md) for the complete grammar and normative behavior.

## Create, send, receive

Start with a full vocabulary so the first receiver can decode the message independently.

```js
import dictionary from './dictionary.json' with { type: 'json' }
import { decode, encode, toEnglish, validate } from './codec.mjs'

const outbound = {
  v: 2,
  vocab: dictionary,
  id: 'deploy-42',
  from: 'planner',
  to: ['worker'],
  i: 'pl',
  c: 0.94,
  s: 'new',
  g: 'deploy the service',
  risk: 'lo',
  ask: 'run',
  st: [
    { id: 'inspect-health', a: 'inspect', x: 'service health', ok: 'health is known' },
    { id: 'restart-service', a: 'restart', x: 'the service', d: 'inspect-health', when: { step: 'inspect-health', outcome: 'success' } },
  ],
}

validate(outbound)
const wire = encode(outbound)

// Transport `wire` as one UTF-8 line through your queue, HTTP body, or agent bus.
const received = decode(wire)
console.log(toEnglish(received))
```

`encode()` validates before serializing. `decode()` resolves and validates the embedded manifest before returning the message object. Both reject malformed frames, unknown codes, invalid references, duplicate tags, unsupported fields, and cyclic or unresolved step dependencies.

Typed conditions and quantities use the same A2 message format:

```js
const safety = {
  v: 2, vocab: dictionary, id: 'restoration-42', from: 'coordinator', to: ['operator'],
  i: 'rq', c: 0.9, s: 'new', g: 'avoid an unsafe restart',
  st: [
    { id: 'restore', a: 'test', x: 'backup restoration' },
    { id: 'verify', a: 'test', x: 'credentials', when: { step: 'restore', outcome: 'failure' } },
  ],
  prohibition: {
    a: 'restart', x: 'production',
    when: { step: 'restore', outcome: 'failure' },
    until: { step: 'verify', outcome: 'success' },
  },
}
const sample = {
  v: 2, vocab: dictionary, id: 'well-w7', from: 'lab', to: ['analyst'],
  i: 'rs', c: 0.8, s: 'new', g: 'nitrate concentration in well W7',
  quantity: { value: '12.5', unit: { ns: 'ucum', id: 'mg.L-1' } },
}
```

Guards describe reported step outcomes, not independent evidence that a step ran. Hosts must verify conditions and enforce prohibitions through their own policy.

The receiver must use `received.i`, `received.s`, `received.ask`, risk, and its own local policy to decide whether to respond, ask a question, request approval, or execute anything. It must never execute solely because it successfully decoded a message.

## Use A2 with AI agents

Use A2 when agents need an exact handoff, and use natural language when a human needs to understand, negotiate, or supply context. A productive pattern is:

1. Give every participating agent the shared instruction in [AGENT_PROMPT.md](AGENT_PROMPT.md), or incorporate its rules into the system prompt.
2. Give the agent host the A2 codec plus an approved vocabulary registry.
3. Have a planning agent emit an A2 `pl` message for a proposed plan, a coordinator emit `rq` to request an action, and a worker return an `rs`, `cf`, `dn`, or `al` message.
4. Decode and validate every incoming frame before presenting it to a model or routing it to a tool.
5. Keep authorization and tool execution in the host application. The host decides whether the request is allowed, whether approval is required, and how success is independently checked.
6. Render important frames with `toEnglish()` for logs, operator review, and incident analysis.

For example, a planner can propose a low-risk deployment plan to a worker. The worker should not assume it owns the plan merely because it is a recipient. It can instead respond with a question, request approval, or report a blocked state. If it executes under host authorization, it should report only what it can support with its own verification procedure.

### Recommended agent loop

```js
function receiveFromAgent(wire, policy) {
  const message = decode(wire, { vocabularies: policy.vocabularies })

  policy.audit({ message, display: toEnglish(message) })

  if (!policy.permits(message)) {
    return encode({
      v: 2, vocab: message.vocab, id: `${message.id}.denied`,
      from: policy.agentId, to: [message.from], i: 'dn', c: 1,
      s: 'blk', g: message.g,
    })
  }

  // The host, not the A2 frame, selects and constrains any tool invocation.
  return policy.handle(message)
}
```

`policy.handle()` should independently validate tool parameters, identity, authorization, environment constraints, and completion evidence. Use a review or approval gate for actions with material risk.

## Vocabulary lifecycle

The vocabulary is part of A2's meaning contract. Concept codes are symbols, not abbreviated English. New domain concepts require a namespace-qualified ontology reference; use a literal when no such reference is available:

```json
{
  "med.fx": {
    "ref": { "ns": "sct", "id": "72704001" },
    "en": "Fracture"
  }
}
```

`ref` is normative; `en` is only a human-display gloss. Do not infer missing definitions from code spelling or display text.

A2 supports three manifest modes:

| Mode | Use | Receiver requirement |
| --- | --- | --- |
| `full` | First contact or a self-contained message. | None; the complete vocabulary is embedded. |
| `delta` | Extend a known vocabulary without retransmitting it. | Cache the named base hash and reject conflicting definitions. |
| `reference` | Reuse an already synchronized vocabulary. | Cache the exact named vocabulary hash. |

For delta or reference frames, supply cached vocabularies by their SHA-256 hash:

```js
const message = decode(wire, {
  vocabularies: {
    'sha256:...': cachedVocabulary,
  },
})
```

Use `readVocabularyManifest(wire)` before semantic decoding when a new receiver needs to inspect advertised acquisition metadata. An A2 manifest can provide `acquire.codec` and `acquire.vocabulary` locations, but the codec deliberately never fetches them. Let the host application retrieve resources through its normal allowlist, integrity checking, and cache policy.

## Event graphs

Use `eg` when the message needs source-independent structure beyond a goal concept. An event graph contains:

- `e`: entities with namespace-qualified identifiers.
- `v`: events with a predicate, typed roles, time, and aspect.
- `q`: quotations and their speaker, recipient, and included events.
- `o`: possession links.
- `c`: explicit causal claims.

The graph makes roles such as agent (`ag`), patient (`pt`), destination (`dst`), and quoted content (`ct`) explicit. Causal links still represent the sender's claim, not proof of causation. See [SPEC.md](SPEC.md) and [semantic.test.mjs](semantic.test.mjs) for complete structures and conformance examples.
`toEnglish()` displays entity and predicate references, role assignments, quotations, possession, and claimed causal links without interpreting ontology identifiers as unstated facts.

## Design rules for agent builders

- Use one message for one intent, and use message dependencies to relate messages.
- Include facts, assumptions, uncertainty, missing inputs, deadlines, and acceptance criteria explicitly when they matter.
- Use literal text only for payloads the shared vocabulary cannot express; do not compress free text into invented shorthand.
- Do not use a route as an ownership assignment or a step dependency as a data-flow declaration.
- Reject unknown codes and invalid vocabulary manifests. Ask the sender to synchronize a vocabulary instead of guessing.
- Preserve distinctions during model prompting: plan versus request, sender confidence versus truth, assertion versus evidence, and valid syntax versus authorization.
- Test semantic round trips, not only parseability. Structural success does not prove that the encoded meaning is equivalent or correct.

## Project files

- [SPEC.md](SPEC.md): normative grammar, validation, rendering, and security rules.
- [dictionary.json](dictionary.json): versioned vocabulary and bilingual guide.
- [AGENT_PROMPT.md](AGENT_PROMPT.md): reusable A2 communication instruction for AI agents.
- [codec.mjs](codec.mjs): validation, encoding, decoding, manifest inspection, and English rendering.
- [codec.test.mjs](codec.test.mjs) and [semantic.test.mjs](semantic.test.mjs): structural and semantic conformance tests.
