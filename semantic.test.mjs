import test from 'node:test'
import assert from 'node:assert/strict'
import dictionary from './dictionary.json' with { type: 'json' }
import { decode, encode, readVocabularyManifest } from './codec.mjs'

const vocabulary = {
  version: 2,
  codes: {
    i: { in: 'inform', pl: 'propose a plan' },
    s: { new: 'new', ok: 'completed successfully' },
    c: {
      backup_plan: { ref: { ns: 'example', id: 'backup-plan' }, en: 'create and validate a configuration backup' },
      service: { ref: { ns: 'example', id: 'service' }, en: 'the service' },
      config_backup: { ref: { ns: 'example', id: 'config-backup' }, en: 'the configuration backup' },
      operator: { ref: { ns: 'example', id: 'operator' }, en: 'the operator' },
    },
    a: { inspect: 'inspect', write: 'write', test: 'test', notify: 'notify' },
    ask: { run: 'execute' },
    risk: { lo: 'low' },
  },
}

const eventVocabulary = {
  version: 2,
  codes: { i: { in: 'inform' }, s: { new: 'new' }, c: {} },
  ontologies: {
    example: {
      revision: '1',
      terms: { narrator: 'narrator', mapple: 'Father Mapple', enter: 'enter' },
    },
  },
}

const sortEntries = (value) => Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
const semanticProjection = (message) => ({
  v: message.v,
  id: message.id,
  from: message.from,
  to: [...message.to],
  i: message.i,
  c: message.c,
  s: message.s,
  g: message.g,
  ...(message.ask ? { ask: message.ask } : {}),
  ...(message.risk ? { risk: message.risk } : {}),
  ...(message.by ? { by: message.by } : {}),
  ...(message.dep ? { dep: [...message.dep] } : {}),
  ...(message.need ? { need: [...message.need] } : {}),
  ...(message.n ? { n: message.n } : {}),
  ...(message.quantity ? { quantity: message.quantity } : {}),
  ...(message.prohibition ? { prohibition: message.prohibition } : {}),
  ...(message.st ? {
    st: message.st.map(({ id, a, x, ag, d, when, ok }) => ({
      id, a, x,
      ...(ag ? { ag } : {}),
      ...(d ? { d } : {}),
      ...(when ? { when } : {}),
      ...(ok ? { ok } : {}),
    })),
  } : {}),
  ...(message.eg ? {
    eg: {
      e: sortEntries(message.eg.e),
      v: sortEntries(Object.fromEntries(Object.entries(message.eg.v).map(([id, event]) => [id, {
        p: event.p, a: sortEntries(event.a),
        ...(event.t ? { t: event.t } : {}),
        ...(event.x ? { x: event.x } : {}),
      }]))),
      ...(message.eg.q ? { q: sortEntries(message.eg.q) } : {}),
      ...(message.eg.o ? { o: [...message.eg.o].sort((a, b) => `${a.h}${a.p}`.localeCompare(`${b.h}${b.p}`)) } : {}),
      ...(message.eg.c ? { c: [...message.eg.c].sort((a, b) => `${a.a}${a.b}`.localeCompare(`${b.a}${b.b}`)) } : {}),
    },
  } : {}),
})

test('semantic conformance preserves a dependent plan', () => {
  const source = {
    v: 2, vocab: vocabulary, id: 'sem.plan.001', from: 'planner', to: ['operator'],
    i: 'pl', c: 0.96, s: 'new', g: '~backup_plan', risk: 'lo', ask: 'run',
    st: [
      { id: 's1', a: 'inspect', x: '~service', ag: '~operator', ok: 'service configuration is known' },
      { id: 's2', a: 'write', x: '~config_backup', ag: '~operator', d: 's1', when: 's1.ok', ok: 'backup exists' },
      { id: 's3', a: 'test', x: '~config_backup', ag: '~operator', d: 's2', when: 's2.ok', ok: 'backup is valid' },
      { id: 's4', a: 'notify', x: '~operator', ag: '~operator', d: 's3', when: 's3.ok', ok: 'operator has been notified' },
    ],
  }
  assert.deepEqual(semanticProjection(decode(encode(source))), semanticProjection(source))
})

test('semantic conformance preserves typed conditions, units, and prohibitions', () => {
  const source = {
    v: 2, vocab: dictionary, id: 'sem.typed.001', from: 'coordinator', to: ['operator'],
    i: 'rq', c: 0.85, s: 'new', g: 'avoid restarting after failed restoration',
    st: [
      { id: 'restore', a: 'test', x: 'backup restoration' },
      { id: 'verify', a: 'test', x: 'credentials', when: { step: 'restore', outcome: 'failure' } },
    ],
    prohibition: { a: 'restart', x: 'production', when: { step: 'restore', outcome: 'failure' }, until: { step: 'verify', outcome: 'success' } },
    quantity: { value: '12.5', unit: { ns: 'ucum', id: 'mg.L-1' } },
  }
  assert.deepEqual(semanticProjection(decode(encode(source))), semanticProjection(source))
})

test('semantic conformance preserves event graph relations', () => {
  const source = {
    v: 2, vocab: eventVocabulary, id: 'sem.graph.001', from: 'narrator', to: ['reader'],
    i: 'in', c: 0.91, s: 'new', g: '[a narrated event]',
    eg: {
      e: {
        n: { r: { ns: 'example', id: 'narrator' } },
        m: { r: { ns: 'example', id: 'mapple' } },
        d: { r: { ns: 'example', id: 'door' } },
      },
      v: {
        enter: { p: { ns: 'example', id: 'enter' }, a: { ag: 'm', dst: 'd' }, t: 'pa', x: 'pf' },
        tell: { p: { ns: 'example', id: 'tell' }, a: { ag: 'n', to: 'm', ct: 'q1' }, t: 'pa', x: 'pf' },
      },
      q: { q1: { by: 'n', to: 'm', v: ['enter'] } },
      o: [{ h: 'm', p: 'd' }],
      c: [{ a: 'enter', b: 'tell' }],
    },
  }
  assert.deepEqual(semanticProjection(decode(encode(source))), semanticProjection(source))
})

test('semantic conformance preserves literals and structured fields', () => {
  const source = {
    v: 2, vocab: dictionary, id: 'sem.literal.001', from: 'agent|east', to: ['reader,west', 'agent>worker'],
    i: 'in', c: 1, s: 'ok', g: 'literal [payload] with | delimiters',
    by: 'before|after', dep: ['message,one'], need: ['credentials'], n: '100000',
  }
  assert.deepEqual(semanticProjection(decode(encode(source))), semanticProjection(source))
})

test('semantic conformance rejects unresolved or conflicting vocabulary', () => {
  assert.throws(() => encode({
    v: 2, vocab: { format: 2, mode: 'reference', hash: 'sha256:missing' }, id: 'bad.001',
    from: 'a', to: ['b'], i: 'in', c: 1, s: 'new', g: '[literal]',
  }), /unavailable|requires acquisition/)
  assert.throws(() => encode({
    v: 2, vocab: { format: 2, mode: 'delta', base: 'sha256:missing', data: { codes: { c: { x: { ref: { ns: 'example', id: 'x' } } } } } },
    id: 'bad.002', from: 'a', to: ['b'], i: 'in', c: 1, s: 'new', g: '[literal]',
  }), /unavailable/)
})

test('A2 bootstrap manifest exposes codec and vocabulary acquisition', () => {
  const source = {
    v: 2, vocab: {
      format: 2,
      mode: 'reference',
      hash: 'sha256:' + 'a'.repeat(64),
      acquire: {
        codec: { uri: 'https://example.test/a2/codec.mjs', hash: 'sha256:' + 'b'.repeat(64), media: 'text/javascript' },
        vocabulary: { uri: 'https://example.test/a2/vocab.json', hash: 'sha256:' + 'a'.repeat(64), media: 'application/a2-vocabulary+json' },
      },
    },
    id: 'bootstrap.001', from: 'sender', to: ['receiver'], i: 'in', c: 1, s: 'new', g: '[bootstrap test]',
  }
  const manifestWire = [
    'A2', source.id, `${source.from}>${source.to[0]}`, 'in100', 'new', '[bootstrap test]',
    `*${Buffer.from(JSON.stringify(source.vocab), 'utf8').toString('base64url')}`,
  ].join('|')
  assert.deepEqual(readVocabularyManifest(manifestWire), source.vocab)
})
