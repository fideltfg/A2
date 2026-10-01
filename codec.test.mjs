import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import dictionary from './dictionary.json' with { type: 'json' }
import { decode, encode, toEnglish } from './codec.mjs'

const vocabularyWire = Buffer.from(JSON.stringify(dictionary), 'utf8').toString('base64url')

const message = {
  v: 2, vocab: dictionary, id: 'p7', from: 'planner', to: ['worker'], i: 'pl', c: 0.94, s: 'new', g: 'deploy the service', risk: 'lo', ask: 'run',
  st: [{ id: 's1', a: 'inspect', x: 'service health' }, { id: 's2', a: 'restart', x: 'the service', d: 's1', when: 's1.ok' }],
}

const eventGraph = {
  e: {
    eu: { r: { ns: 'od', id: 'euryclea' } }, pe: { r: { ns: 'od', id: 'penelope' } },
    od: { r: { ns: 'od', id: 'odysseus' } }, su: { r: { ns: 'od', id: 'suitors' } },
    es: { r: { ns: 'od', id: 'estate' } }, so: { r: { ns: 'od', id: 'son' } },
  },
  v: {
    tell: { p: { ns: 'od.act', id: 'tell' }, a: { ag: 'eu', to: 'pe', ct: 'q1' }, t: 'pa', x: 'pf' },
    return: { p: { ns: 'od.act', id: 'return' }, a: { ag: 'od' }, t: 'pa', x: 'pf' },
    kill: { p: { ns: 'od.act', id: 'kill' }, a: { ag: 'od', pt: 'su' }, t: 'pa', x: 'pf' },
    consume: { p: { ns: 'od.act', id: 'consume' }, a: { ag: 'su', pt: 'es' }, t: 'pa', x: 'ip' },
  },
  q: { q1: { by: 'eu', to: 'pe', v: ['return', 'kill'] } },
  o: [{ h: 'od', p: 'es' }],
  c: [{ a: 'consume', b: 'kill' }],
}

test('round trips a compact plan', () => assert.deepEqual(decode(encode(message)), message))
test('A2 typed guards coexist with literal guards', () => {
  const mixed = { ...message, st: [message.st[0], message.st[1], { id: 's3', a: 'test', x: 'service', when: { step: 's2', outcome: 'success' } }] }
  assert.match(encode(mixed), /^A2\|/)
  assert.deepEqual(decode(encode(mixed)), mixed)
})
test('A2 round trips a guarded plan, quantity, and conditional prohibition', () => {
  const typed = {
    ...message, i: 'rq', g: 'handle failed restoration',
    st: [
      { id: 'restore', a: 'test', x: 'backup restoration' },
      { id: 'verify', a: 'test', x: 'credentials', when: { step: 'restore', outcome: 'failure' } },
    ],
    quantity: { value: '12.5', unit: { ns: 'ucum', id: 'mg.L-1' } },
    prohibition: { a: 'restart', x: 'production', when: { step: 'restore', outcome: 'failure' }, until: { step: 'verify', outcome: 'success' } },
  }
  const wire = encode(typed)
  assert.match(wire, /^A2\|/)
  assert.match(wire, /\|%[A-Za-z0-9_-]+(?:\||$)/)
  assert.deepEqual(decode(wire), typed)
  const rendered = toEnglish(decode(wire))
  assert.match(rendered, /Quantity for goal: 12\.5 \[ucum:mg\.L-1\]/)
  assert.match(rendered, /do not restart production if step restore reports failure, until step verify reports success/)
  assert.match(rendered, /test credentials when step restore reports failure/)
})
test('A2 rejects invalid guards, quantities, and prohibitions', () => {
  const typed = { ...message, st: [{ id: 's1', a: 'test', x: 'backup' }, { id: 's2', a: 'restart', x: 'service', when: { step: 's1', outcome: 'success' } }] }
  assert.throws(() => encode({ ...typed, st: [{ ...typed.st[0], when: { step: 's2', outcome: 'success' } }, typed.st[1]] }), /earlier step/)
  assert.throws(() => encode({ ...typed, st: [typed.st[0], { ...typed.st[1], when: { step: 'missing', outcome: 'success' } }] }), /earlier step/)
  assert.throws(() => encode({ ...typed, st: [typed.st[0], { ...typed.st[1], when: { step: 's1', outcome: 'unknown' } }] }), /outcome must be success or failure/)
  assert.throws(() => encode({ ...typed, quantity: { value: '12.5', unit: { ns: 'ucum', id: 'mg/L' } } }), /identifier-safe ontology reference/)
  assert.throws(() => encode({ ...typed, quantity: { value: '12.5', unit: { ns: 'ucum', id: 'mg.L-1' } }, n: '12.5' }), /cannot both be present/)
  assert.throws(() => encode({ ...typed, prohibition: { a: 'restart', x: 'service', when: { step: 'missing', outcome: 'failure' } } }), /earlier step/)
  assert.throws(() => encode({ ...typed, prohibition: { a: 'unknown', x: 'service', when: { step: 's1', outcome: 'failure' } } }), /known a code/)
  assert.throws(() => encode({ ...typed, v: 3 }), /Only A2 is supported/)
})
test('A2 rejects unknown and noncanonical typed wire fields', () => {
  const base = encode({ ...message, st: [{ id: 's1', a: 'test', x: 'backup' }] })
  const payload = (value) => Buffer.from(value).toString('base64url')
  assert.throws(() => decode(`${base}|%${payload('{"unknown":true}')}`), /Unsupported A2 typed fields field/)
  assert.throws(() => decode(`${base}|%${payload('{"quantity":{"value":"1","unit":{"ns":"ucum","id":"m"}}}')}`), /canonical/)
  assert.throws(() => decode(`${base}|%${payload('{"guards":{"missing":{"outcome":"success","step":"s1"}}}')}`), /unknown or guarded step/)
  assert.throws(() => decode(`${base}|%${payload('{}')}`), /must not be empty/)
  assert.throws(() => decode(`${base}|%${payload('{"quantity":{}}')}`), /quantity.value/)
})
test('confidence percentages round trip, including 100%', () => {
  for (const confidence of [0, 0.001, 0.1, 0.29, 0.945, 1]) {
    const encoded = encode({ ...message, c: confidence })
    assert.equal(decode(encoded).c, confidence)
  }
  assert.match(encode({ ...message, c: 1 }), /\|pl100\|/)
  assert.equal(decode(`A2|x|narrator>reader|in100|new|[Odyssey]|*${vocabularyWire}`).c, 1)
  assert.match(toEnglish({ ...message, c: 0.945 }), /94\.5% confidence/)
})
test('round trips all supported optional fields without dropping values', () => {
  const complete = {
    ...message, by: '2026-09-30', dep: ['previous'], need: ['credentials'], n: '100000',
    st: [{ id: 's1', a: 'inspect', x: 'service health', ok: 'health is known' }],
  }
  assert.deepEqual(decode(encode(complete)), complete)
})
test('encodes exact structured numeric results', () => {
  const result = { ...message, i: 'rs', s: 'ok', g: 'integer result', n: '100000' }
  assert.match(encode(result), /\|#100000(?:\||$)/)
  assert.equal(decode(`A2|count|agent>user|rs100|ok|[integer result]|*${vocabularyWire}|#100000`).n, '100000')
  assert.match(toEnglish(result), /Numeric result: 100000/)
})
test('rejects ambiguous numeric-result encodings', () => {
  for (const n of [100000, '001', '1.0', '-0', '1e5', '']) assert.throws(() => encode({ ...message, n }), /canonical decimal string/)
})
test('round trips a canonical event graph', () => {
  const narrative = { ...message, i: 'in', s: 'ok', eg: eventGraph }
  const wire = encode(narrative)
  assert.match(wire, /\|&e\{[^|]+;v\{[^|]+(?:\||$)/)
  assert.deepEqual(decode(wire), narrative)
  const rendered = toEnglish(decode(wire))
  assert.match(rendered, /eu \(od:euryclea\)/)
  assert.match(rendered, /tell \(od\.act:tell\): .*agent=eu \(od:euryclea\).*quoted content=q1.*recipient=pe \(od:penelope\)/)
  assert.match(rendered, /q1: speaker=eu \(od:euryclea\), recipient=pe \(od:penelope\), quoted events=return \(od\.act:return\), kill \(od\.act:kill\)/)
  assert.match(rendered, /holder=od \(od:odysseus\), possessed=es \(od:estate\)/)
  assert.match(rendered, /Claimed causal links: consume \(od\.act:consume\) -> kill \(od\.act:kill\)/)
})
test('renders omitted and empty graph relations without inventing details', () => {
  const graph = {
    e: { worker: { r: { ns: 'example', id: 'worker' } } },
    v: { act: { p: { ns: 'example', id: 'act' }, a: { ag: 'worker' } } },
  }
  const withoutOptional = toEnglish({ ...message, eg: graph })
  assert.match(withoutOptional, /other roles=unspecified, time=unspecified, aspect=unspecified/)
  assert.doesNotMatch(withoutOptional, /Quotations:|Possession links:|Claimed causal links:/)
  const withEmpty = toEnglish({ ...message, eg: { ...graph, q: {}, o: [], c: [] } })
  assert.match(withEmpty, /Quotations: none\. Possession links: none\. Claimed causal links: none\./)
})
test('rejects event graphs with unresolved role targets', () => {
  const invalid = structuredClone(eventGraph)
  invalid.v.tell.a.ag = 'unknown'
  assert.throws(() => encode({ ...message, eg: invalid }), /unknown target/)
})
test('requires an identified speaker for quoted event content', () => {
  const invalid = structuredClone(eventGraph)
  delete invalid.q.q1.by
  assert.throws(() => encode({ ...message, eg: invalid }), /q1\.by must reference an entity/)
})
test('resolves compact symbol and registered foreign concept aliases', () => {
  const symbol = { ...message, g: '~fx' }
  const foreign = { ...message, g: '~骨折' }
  assert.equal(decode(encode(symbol)).g, '~fx')
  assert.equal(decode(encode(foreign)).g, '~骨折')
  assert.match(toEnglish(symbol), /Fracture/)
  assert.match(toEnglish(foreign), /Fracture/)
})
test('round trips commas and backslashes in list fields', () => {
  const withDelimiters = { ...message, dep: ['message,one'], need: ['a,b', 'c\\d'] }
  assert.deepEqual(decode(encode(withDelimiters)), withDelimiters)
})
test('round trips structural characters in routes and deadlines', () => {
  const withDelimiters = { ...message, from: 'agent|east', to: ['reader,west', 'agent>worker'], by: 'before|after' }
  assert.deepEqual(decode(encode(withDelimiters)), withDelimiters)
  assert.throws(() => encode({ ...message, id: 'id|suffix' }), /frame separator/)
})
test('round trips delimiters inside bracketed plan subjects', () => {
  const withLiteral = { ...message, g: 'summary [with|brackets]', st: [{ id: 's1', a: 'inspect', x: 'item; [part]' }] }
  assert.deepEqual(decode(encode(withLiteral)), withLiteral)
})
test('round trips literal step executors', () => {
  const withExecutor = { ...message, st: [{ id: 's1', a: 'inspect', x: 'service health', ag: 'Ava; [east]|team' }] }
  assert.deepEqual(decode(encode(withExecutor)), withExecutor)
  assert.match(toEnglish(withExecutor), /by Ava; \[east\]\|team/)
})
test('rejects duplicate optional tags instead of taking the last value', () => {
  assert.throws(() => decode(`A2|x|a>b|in100|new|[literal]|*${vocabularyWire}|!lo|!hi`), /Duplicate A2 tag: !/)
})
test('rejects fields the wire format cannot preserve', () => {
  assert.throws(() => encode({ ...message, unsupported: 'meaning' }), /Unsupported message field/)
  assert.throws(() => encode({ ...message, st: [{ id: 's1', a: 'inspect', x: 'service health', by: 'tomorrow' }] }), /Unsupported st\[0\] field: by/)
  assert.throws(() => encode({ ...message, st: [{ id: 'bad:id', a: 'inspect', x: 'service health' }] }), /valid id/)
  assert.throws(() => encode({ ...message, st: [{ id: 's1', a: 'inspect', x: 'service health', d: 's1' }] }), /Cyclic step dependency/)
  assert.throws(() => encode({ ...message, st: [{ id: 's1', a: 'inspect', x: 'service health', d: 's2' }, { id: 's2', a: 'inspect', x: 'service health', d: 's1' }] }), /Cyclic step dependency/)
})
test('A2 wire form carries its vocabulary', () => {
  const wire = encode(message)
  assert.match(wire, /^A2\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|\*/) 
  assert.deepEqual(decode(wire).vocab, dictionary)
})
test('A2 resolves full, delta, and reference vocabularies', () => {
  const fullMessage = { ...message }
  const fullWire = encode(fullMessage)
  const fullManifest = JSON.parse(Buffer.from(fullWire.split('|*')[1].split('|')[0], 'base64url').toString('utf8'))
  const registry = { [fullManifest.hash]: dictionary }
  const deltaVocabulary = {
    format: 2, mode: 'delta', base: fullManifest.hash,
    data: { codes: { c: { a2_feedback: { ref: { ns: 'example', id: 'a2-feedback' }, en: 'feedback about A2' } } } },
  }
  const deltaMessage = { ...message, id: 'delta', vocab: deltaVocabulary, g: '~a2_feedback' }
  const deltaWire = encode(deltaMessage, { vocabularies: registry })
  assert.deepEqual(decode(deltaWire, { vocabularies: registry }).vocab.codes.c.a2_feedback, deltaVocabulary.data.codes.c.a2_feedback)
  const referenceMessage = { ...message, id: 'reference', vocab: { format: 2, mode: 'reference', hash: fullManifest.hash } }
  assert.deepEqual(decode(encode(referenceMessage, { vocabularies: registry }), { vocabularies: registry }).vocab, dictionary)
  assert.throws(() => decode(encode(referenceMessage, { vocabularies: registry })), /vocabulary is unavailable/)
  assert.throws(() => encode({ ...deltaMessage, vocab: { ...deltaVocabulary, data: { codes: { c: { 'med.fx': { ref: { ns: 'sct', id: 'other' } } } } } } }, { vocabularies: registry }), /conflicts with the base vocabulary/)
})
test('renders all safety-relevant plan fields', () => {
  const text = toEnglish(message)
  assert.match(text, /propose a plan: deploy the service/)
  assert.match(text, /94% confidence/)
  assert.match(text, /low/)
  assert.match(text, /after s1/)
})
test('rejects unknown vocabulary instead of guessing', () => assert.throws(() => encode({ ...message, i: 'maybe' }), /known i code/))
test('requires A2 and an embedded vocabulary', () => {
  assert.throws(() => encode({ ...message, v: 1 }), /Only A2 is supported/)
  assert.throws(() => encode({ ...message, vocab: undefined }), /message\.vocab must be an object/)
  assert.throws(() => decode('A1|x|a>b|in100|new|[literal]'), /Invalid A2 frame/)
})
test('rejects invalid confidence', () => assert.throws(() => encode({ ...message, c: 2 }), /between 0 and 1/))
test('rejects non-finite confidence and ambiguous routes', () => {
  assert.throws(() => encode({ ...message, c: Number.NaN }), /finite number/)
  assert.throws(() => decode(`A2|x|a>b>c|in100|new|[literal]|*${vocabularyWire}`), /exactly one/)
})
test('rejects unknown concept codes', () => assert.throws(() => encode({ ...message, g: '~unknown' }), /known c code/))
test('uses namespace-qualified semantic references for ontology concepts', () => {
  const ontologyMessage = { ...message, g: '~med.fx' }
  assert.equal(encode(ontologyMessage).split('|')[5], '~med.fx')
  assert.deepEqual(dictionary.codes.c['med.fx'].ref, { ns: 'sct', id: '72704001' })
  assert.match(toEnglish(ontologyMessage), /Fracture/)
})
test('embedded A2 guide messages use the dictionary', () => {
  assert.equal(dictionary.guide.en.length, dictionary.guide.a2.length)
  for (const [index, line] of dictionary.guide.a2.entries()) {
    const decoded = decode(line)
    assert.equal(decoded.g, dictionary.guide.en[index])
    assert.ok(toEnglish(decoded).includes(dictionary.guide.en[index]))
    assert.equal(decode(encode(decoded)).g, dictionary.guide.en[index])
  }
})
test('default dictionary contains only ontology-backed concepts', () => {
  for (const definition of Object.values(dictionary.codes.c)) assert.ok(definition.ref?.ns && definition.ref?.id)
  assert.throws(() => encode({ ...message, g: '~dpl' }), /known c code/)
})
test('checked-in example frames remain decodable', () => {
  const lines = readFileSync(new URL('./examples.ail', import.meta.url), 'utf8').split('\n').filter((line) => line.startsWith('A2|'))
  assert.ok(lines.length > 0)
  for (const line of lines) assert.doesNotThrow(() => decode(line))
})
test('Odyssey translation resolves every domain concept', () => {
  const lines = readFileSync(new URL('./odyssey.ail', import.meta.url), 'utf8').split('\n').filter((line) => line && !line.startsWith('#'))
  assert.equal(lines.length, 24)
  for (const line of lines) assert.match(toEnglish(decode(line)), /Message od\d+/)
})
