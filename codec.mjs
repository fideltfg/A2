import dictionary from './dictionary.json' with { type: 'json' }
import { createHash } from 'node:crypto'

const canonicalCode = (group, value, vocabulary = dictionary) => vocabulary.aliases?.[group]?.[value] ?? value

const code = (group, value, path, vocabulary = dictionary) => {
  const canonical = canonicalCode(group, value, vocabulary)
  if (typeof value !== 'string' || !vocabulary.codes[group]?.[canonical]) throw new Error(`${path} must be a known ${group} code`)
}

const allowedKeys = (value, allowed, path) => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unsupported ${path} field: ${key}`)
}

const concept = (value, path, vocabulary = dictionary) => {
  code('c', value, path, vocabulary)
  const definition = vocabulary.codes.c[canonicalCode('c', value, vocabulary)]
  if (typeof definition === 'string') return
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw new Error(`${path} must have a valid concept definition`)
  if (!definition.ref || typeof definition.ref !== 'object' || Array.isArray(definition.ref) || typeof definition.ref.ns !== 'string' || !definition.ref.ns || typeof definition.ref.id !== 'string' || !definition.ref.id) throw new Error(`${path} must have a namespace-qualified concept reference`)
  if ('en' in definition && (typeof definition.en !== 'string' || !definition.en)) throw new Error(`${path}.en must be a non-empty English gloss`)
}

const canonicalDecimal = (value, path) => {
  if (typeof value !== 'string' || value === '-0' || !/^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/.test(value)) throw new Error(`${path} must be a canonical decimal string`)
}

const graphId = (value, path) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error(`${path} must be a graph identifier`)
}

const ontologyReference = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an ontology reference`)
  allowedKeys(value, ['ns', 'id'], path)
  for (const key of ['ns', 'id']) if (typeof value[key] !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(value[key])) throw new Error(`${path}.${key} must be an identifier-safe ontology reference`)
}

const guard = (value, steps, path, before = steps.length) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be a step outcome guard`)
  allowedKeys(value, ['step', 'outcome'], path)
  if (!['success', 'failure'].includes(value.outcome)) throw new Error(`${path}.outcome must be success or failure`)
  // A step cannot depend on its own or a future step's reported outcome.
  const index = steps.findIndex((step) => step.id === value.step)
  if (index < 0 || index >= before) throw new Error(`${path}.step must reference an earlier step`)
}

const graph = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  allowedKeys(value, ['e', 'v', 'q', 'o', 'c'], path)
  if (!value.e || typeof value.e !== 'object' || Array.isArray(value.e) || !Object.keys(value.e).length) throw new Error(`${path}.e must be a non-empty entity map`)
  if (!value.v || typeof value.v !== 'object' || Array.isArray(value.v) || !Object.keys(value.v).length) throw new Error(`${path}.v must be a non-empty event map`)
  const entityIds = new Set(Object.keys(value.e))
  const eventIds = new Set(Object.keys(value.v))
  const quoteIds = new Set(Object.keys(value.q ?? {}))
  for (const [id, entity] of Object.entries(value.e)) {
    graphId(id, `${path}.e key`)
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) throw new Error(`${path}.e.${id} must be an object`)
    allowedKeys(entity, ['r'], `${path}.e.${id}`)
    ontologyReference(entity.r, `${path}.e.${id}.r`)
  }
  const roles = new Set(['ag', 'pt', 'to', 'ct', 'src', 'dst', 'loc', 'ins', 'ben'])
  for (const [id, event] of Object.entries(value.v)) {
    graphId(id, `${path}.v key`)
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error(`${path}.v.${id} must be an object`)
    allowedKeys(event, ['p', 'a', 't', 'x'], `${path}.v.${id}`)
    ontologyReference(event.p, `${path}.v.${id}.p`)
    if (!event.a || typeof event.a !== 'object' || Array.isArray(event.a) || !Object.keys(event.a).length) throw new Error(`${path}.v.${id}.a must be a non-empty role map`)
    for (const [role, target] of Object.entries(event.a)) {
      if (!roles.has(role)) throw new Error(`${path}.v.${id}.a has unknown role: ${role}`)
      graphId(target, `${path}.v.${id}.a.${role}`)
      if (role === 'ct' ? !quoteIds.has(target) : !entityIds.has(target)) throw new Error(`${path}.v.${id}.a.${role} has an unknown target: ${target}`)
    }
    if ('t' in event && !['pa', 'pr', 'fu', 'un'].includes(event.t)) throw new Error(`${path}.v.${id}.t must be pa, pr, fu, or un`)
    if ('x' in event && !['pf', 'ip', 'pg', 'un'].includes(event.x)) throw new Error(`${path}.v.${id}.x must be pf, ip, pg, or un`)
  }
  if ('q' in value && (!value.q || typeof value.q !== 'object' || Array.isArray(value.q))) throw new Error(`${path}.q must be an object`)
  for (const [id, quote] of Object.entries(value.q ?? {})) {
    graphId(id, `${path}.q key`)
    if (!quote || typeof quote !== 'object' || Array.isArray(quote)) throw new Error(`${path}.q.${id} must be an object`)
    allowedKeys(quote, ['by', 'to', 'v'], `${path}.q.${id}`)
    if (!('by' in quote)) throw new Error(`${path}.q.${id}.by must reference an entity`)
    for (const role of ['by', 'to']) if (role in quote && (!entityIds.has(quote[role]) || typeof quote[role] !== 'string')) throw new Error(`${path}.q.${id}.${role} must reference an entity`)
    if (!Array.isArray(quote.v) || !quote.v.length || quote.v.some((eventId) => typeof eventId !== 'string' || !eventIds.has(eventId))) throw new Error(`${path}.q.${id}.v must reference one or more events`)
  }
  if ('o' in value && (!Array.isArray(value.o) || value.o.some((edge) => !edge || typeof edge !== 'object' || Array.isArray(edge) || !entityIds.has(edge.h) || !entityIds.has(edge.p) || Object.keys(edge).some((key) => !['h', 'p'].includes(key))))) throw new Error(`${path}.o must contain holder and possession entity references`)
  if ('c' in value && (!Array.isArray(value.c) || value.c.some((edge) => !edge || typeof edge !== 'object' || Array.isArray(edge) || !eventIds.has(edge.a) || !eventIds.has(edge.b) || Object.keys(edge).some((key) => !['a', 'b'].includes(key))))) throw new Error(`${path}.c must contain cause and effect event references`)
}

const vocabulary = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  if (value.version !== 2) throw new Error(`${path}.version must be 2`)
  if (!value.codes || typeof value.codes !== 'object' || Array.isArray(value.codes)) throw new Error(`${path}.codes must be an object`)
  for (const group of ['i', 's', 'c']) {
    if (!value.codes[group] || typeof value.codes[group] !== 'object' || Array.isArray(value.codes[group])) throw new Error(`${path}.codes.${group} must be an object`)
  }
  return value
}

const acquisition = (value, path) => {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  allowedKeys(value, ['codec', 'vocabulary'], path)
  for (const key of ['codec', 'vocabulary']) {
    if (!(key in value)) continue
    const resource = value[key]
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) throw new Error(`${path}.${key} must be an object`)
    allowedKeys(resource, ['uri', 'hash', 'media'], `${path}.${key}`)
    if (typeof resource.uri !== 'string' || !resource.uri) throw new Error(`${path}.${key}.uri must be a non-empty string`)
    if ('hash' in resource && (typeof resource.hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(resource.hash))) throw new Error(`${path}.${key}.hash must be a SHA-256 hash`)
    if ('media' in resource && (typeof resource.media !== 'string' || !resource.media)) throw new Error(`${path}.${key}.media must be a non-empty string`)
  }
}

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

const vocabularyHash = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`
const vocabularyManifest = (value) => value?.mode ? value : { format: 2, mode: 'full', data: value }
const vocabularyLookup = (hash, options, path) => {
  const registry = options.vocabularies ?? {}
  const candidate = registry instanceof Map ? registry.get(hash) : registry[hash]
  if (!candidate) throw new Error(`${path} vocabulary is unavailable: ${hash}`)
  return resolveVocabulary(candidate, options).data
}
const mergeVocabulary = (base, delta, path = 'vocabulary') => {
  if (!delta || typeof delta !== 'object' || Array.isArray(delta)) throw new Error(`${path} delta must be an object`)
  const result = structuredClone(base)
  for (const [key, value] of Object.entries(delta)) {
    if (!(key in result)) { result[key] = structuredClone(value); continue }
    if (value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = mergeVocabulary(result[key], value, `${path}.${key}`)
      continue
    }
    if (JSON.stringify(result[key]) !== JSON.stringify(value)) throw new Error(`${path}.${key} conflicts with the base vocabulary`)
  }
  return result
}
function resolveVocabulary(value, options = {}) {
  const manifest = vocabularyManifest(value)
  if (manifest.format !== 2) throw new Error('Vocabulary format must be 2')
  acquisition(manifest.acquire, 'Vocabulary acquire')
  if (manifest.mode === 'reference' && !manifest.acquire?.vocabulary && !options.vocabularies) throw new Error(`Referenced vocabulary is unavailable: ${manifest.hash}`)
  let data
  if (manifest.mode === 'full') data = manifest.data
  else if (manifest.mode === 'delta') data = mergeVocabulary(vocabularyLookup(manifest.base, options, 'Base'), manifest.data, 'Vocabulary delta')
  else if (manifest.mode === 'reference') data = vocabularyLookup(manifest.hash, options, 'Referenced')
  else throw new Error(`Unsupported vocabulary mode: ${manifest.mode}`)
  vocabulary(data, 'message.vocab')
  const hash = vocabularyHash(data)
  if (manifest.hash && manifest.hash !== hash) throw new Error(`Vocabulary hash mismatch: expected ${manifest.hash}, got ${hash}`)
  return { data, manifest: { ...manifest, format: 2, hash } }
}

const vocabularyToWire = (value, options = {}) => {
  const resolved = resolveVocabulary(value, options)
  const manifest = resolved.manifest.mode === 'full' ? { ...resolved.manifest, data: resolved.data } : resolved.manifest
  return Buffer.from(JSON.stringify(canonicalize(manifest)), 'utf8').toString('base64url')
}
const vocabularyFromWire = (value) => {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) } catch { throw new Error('Invalid A2 vocabulary') }
}

export function readVocabularyManifest(wire) {
  if (typeof wire !== 'string' || wire.includes('\n')) throw new Error('A2 wire data must be one line')
  const fields = splitFields(wire)
  if (fields[0] !== 'A2') throw new Error('Vocabulary manifest requires an A2 frame')
  const encoded = fields.find((field) => field.startsWith('*'))
  if (!encoded) throw new Error('A2 frame has no vocabulary manifest')
  const manifest = vocabularyFromWire(encoded.slice(1))
  acquisition(manifest.acquire, 'Vocabulary acquire')
  return manifest
}

const graphReferenceToWire = (reference) => `${reference.ns}:${reference.id}`

const orderedEntries = (value) => Object.entries(value).sort(([left], [right]) => left.localeCompare(right))

function graphToWire(value) {
  const sections = [
    `e{${orderedEntries(value.e).map(([id, entity]) => `${id}=${graphReferenceToWire(entity.r)}`).join(',')}}`,
    `v{${orderedEntries(value.v).map(([id, event]) => {
      const roles = orderedEntries(event.a).map(([role, target]) => `${role}=${target}`).join(',')
      const timeAspect = 't' in event || 'x' in event ? `@${event.t ?? ''}.${event.x ?? ''}` : ''
      return `${id}=${graphReferenceToWire(event.p)}/${roles}${timeAspect}`
    }).join('+')}}`,
  ]
  if ('q' in value) sections.push(`q{${orderedEntries(value.q).map(([id, quote]) => `${id}=${quote.by}${quote.to ? `>${quote.to}` : ''}:${quote.v.join(',')}`).join('+')}}`)
  if ('o' in value) sections.push(`o{${value.o.map((edge) => `${edge.h}>${edge.p}`).join(',')}}`)
  if ('c' in value) sections.push(`c{${value.c.map((edge) => `${edge.a}>${edge.b}`).join(',')}}`)
  return sections.join(';')
}

const graphEntries = (value, separator) => value ? value.split(separator) : []
const graphReferenceFromWire = (value, path) => {
  const match = value.match(/^([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)$/)
  if (!match) throw new Error(`Invalid ${path} reference`)
  return { ns: match[1], id: match[2] }
}

function graphFromWire(value) {
  if (typeof value !== 'string' || !value) throw new Error('Invalid event graph encoding')
  const sections = new Map()
  for (const section of value.split(';')) {
    const match = section.match(/^([evqoc])\{([^{}]*)\}$/)
    if (!match || sections.has(match?.[1])) throw new Error('Invalid event graph encoding')
    sections.set(match[1], match[2])
  }
  if (!sections.has('e') || !sections.has('v')) throw new Error('Event graph requires entity and event sections')
  const parsed = { e: {}, v: {} }
  for (const entry of graphEntries(sections.get('e'), ',')) {
    const match = entry.match(/^([A-Za-z0-9_.-]+)=([A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+)$/)
    if (!match) throw new Error(`Invalid entity: ${entry}`)
    parsed.e[match[1]] = { r: graphReferenceFromWire(match[2], `entity ${match[1]}`) }
  }
  for (const entry of graphEntries(sections.get('v'), '+')) {
    const match = entry.match(/^([A-Za-z0-9_.-]+)=([A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+)\/([^@]+)(?:@([a-z]{0,2})\.([a-z]{0,2}))?$/)
    if (!match) throw new Error(`Invalid event: ${entry}`)
    const roles = {}
    for (const role of match[3].split(',')) {
      const roleMatch = role.match(/^([a-z]+)=([A-Za-z0-9_.-]+)$/)
      if (!roleMatch || roleMatch[1] in roles) throw new Error(`Invalid event role: ${role}`)
      roles[roleMatch[1]] = roleMatch[2]
    }
    parsed.v[match[1]] = { p: graphReferenceFromWire(match[2], `event ${match[1]}`), a: roles }
    if (match[4]) parsed.v[match[1]].t = match[4]
    if (match[5]) parsed.v[match[1]].x = match[5]
  }
  if (sections.has('q')) {
    parsed.q = {}
    for (const entry of graphEntries(sections.get('q'), '+')) {
      const match = entry.match(/^([A-Za-z0-9_.-]+)=([A-Za-z0-9_.-]+)(?:>([A-Za-z0-9_.-]+))?:([A-Za-z0-9_.-]+(?:,[A-Za-z0-9_.-]+)*)$/)
      if (!match) throw new Error(`Invalid quotation: ${entry}`)
      parsed.q[match[1]] = { by: match[2], ...(match[3] ? { to: match[3] } : {}), v: match[4].split(',') }
    }
  }
  for (const [section, key, names] of [['o', 'o', ['h', 'p']], ['c', 'c', ['a', 'b']]]) {
    if (!sections.has(section)) continue
    parsed[key] = graphEntries(sections.get(section), ',').map((entry) => {
      const match = entry.match(/^([A-Za-z0-9_.-]+)>([A-Za-z0-9_.-]+)$/)
      if (!match) throw new Error(`Invalid ${section} link: ${entry}`)
      return { [names[0]]: match[1], [names[1]]: match[2] }
    })
  }
  if (graphToWire(parsed) !== value) throw new Error('Event graph encoding must be canonical')
  return parsed
}

export function validate(message, options = {}) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('A2 message must be an object')
  allowedKeys(message, ['v', 'id', 'from', 'to', 'i', 'c', 's', 'g', 'n', 'quantity', 'prohibition', 'eg', 'ask', 'risk', 'by', 'dep', 'need', 'st', 'vocab', 'vocabMeta'], 'message')
  for (const key of ['v', 'id', 'from', 'to', 'i', 'c', 's', 'g']) if (!(key in message)) throw new Error(`Missing required field: ${key}`)
  if (message.v !== 2) throw new Error('Only A2 is supported')
  const messageVocabulary = resolveVocabulary(message.vocab, options).data
  for (const key of ['id', 'from', 'g']) if (typeof message[key] !== 'string' || !message[key] || message[key].includes('\n')) throw new Error(`${key} must be a non-empty single-line string`)
  if (message.id.includes('|')) throw new Error('id cannot contain the frame separator |')
  if (!Array.isArray(message.to) || !message.to.length || message.to.some((x) => typeof x !== 'string' || !x || x.includes('\n'))) throw new Error('to must be a non-empty single-line string array')
  if (typeof message.c !== 'number' || !Number.isFinite(message.c) || message.c < 0 || message.c > 1) throw new Error('c must be a finite number between 0 and 1')
  code('i', message.i, 'i', messageVocabulary); code('s', message.s, 's', messageVocabulary)
  if (message.g.startsWith('~')) concept(message.g.slice(1), 'g', messageVocabulary)
  if ('n' in message) canonicalDecimal(message.n, 'n')
  if ('quantity' in message) {
    const quantity = message.quantity
    if (!quantity || typeof quantity !== 'object' || Array.isArray(quantity)) throw new Error('quantity must be an object')
    allowedKeys(quantity, ['value', 'unit'], 'quantity')
    if ('n' in message) throw new Error('n and quantity cannot both be present')
    canonicalDecimal(quantity.value, 'quantity.value')
    ontologyReference(quantity.unit, 'quantity.unit')
  }
  if ('eg' in message) graph(message.eg, 'eg')
  if ('ask' in message) code('ask', message.ask, 'ask', messageVocabulary)
  if ('risk' in message) code('risk', message.risk, 'risk', messageVocabulary)
  if ('by' in message && (typeof message.by !== 'string' || !message.by || message.by.includes('\n'))) throw new Error('by must be a non-empty single-line string')
  for (const key of ['dep', 'need']) {
    if (key in message && (!Array.isArray(message[key]) || message[key].some((value) => typeof value !== 'string' || !value || value.includes('\n')))) throw new Error(`${key} must be a single-line string array`)
  }
  if ('st' in message) {
    if (!Array.isArray(message.st)) throw new Error('st must be an array')
    const ids = new Set()
    for (const [index, step] of message.st.entries()) {
      if (!step || typeof step !== 'object' || Array.isArray(step)) throw new Error(`st[${index}] must be an object`)
      allowedKeys(step, ['id', 'a', 'x', 'ag', 'd', 'when', 'ok'], `st[${index}]`)
      if (typeof step.id !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(step.id) || typeof step.x !== 'string' || !step.x || step.x.includes('\n')) throw new Error(`st[${index}] needs a valid id and single-line x`)
      if (ids.has(step.id)) throw new Error(`Duplicate step id: ${step.id}`)
      ids.add(step.id); code('a', step.a, `st[${index}].a`, messageVocabulary)
      if (step.x.startsWith('~')) concept(step.x.slice(1), `st[${index}].x`, messageVocabulary)
      if ('ag' in step && (typeof step.ag !== 'string' || !step.ag || step.ag.includes('\n'))) throw new Error(`st[${index}].ag must be a non-empty single-line value`)
      if (step.ag?.startsWith('~')) concept(step.ag.slice(1), `st[${index}].ag`, messageVocabulary)
      if ('d' in step && (typeof step.d !== 'string' || !message.st.some((candidate) => candidate.id === step.d))) throw new Error(`Unknown step dependency: ${step.d}`)
      if ('when' in step) {
        if (typeof step.when === 'object' && step.when !== null) guard(step.when, message.st, `st[${index}].when`, index)
        else if (typeof step.when !== 'string' || !step.when || /[\n;=~]/.test(step.when)) throw new Error(`st[${index}].when must be a non-empty single-line value without reserved delimiters`)
      }
      if ('ok' in step && (typeof step.ok !== 'string' || !step.ok || /[\n;=~]/.test(step.ok))) throw new Error(`st[${index}].ok must be a non-empty single-line value without reserved delimiters`)
    }
    const stepsById = new Map(message.st.map((step) => [step.id, step]))
    for (const step of message.st) {
      const seen = new Set()
      let current = step
      while (current?.d) {
        if (seen.has(current.id)) throw new Error(`Cyclic step dependency: ${current.id}`)
        seen.add(current.id)
        current = stepsById.get(current.d)
      }
    }
  }
  if ('prohibition' in message) {
    const rule = message.prohibition
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('prohibition must be an object')
    allowedKeys(rule, ['a', 'x', 'when', 'until'], 'prohibition')
    code('a', rule.a, 'prohibition.a', messageVocabulary)
    if (typeof rule.x !== 'string' || !rule.x || rule.x.includes('\n')) throw new Error('prohibition.x must be a non-empty single-line subject')
    if (rule.x.startsWith('~')) concept(rule.x.slice(1), 'prohibition.x', messageVocabulary)
    guard(rule.when, message.st ?? [], 'prohibition.when')
    if ('until' in rule) guard(rule.until, message.st ?? [], 'prohibition.until')
  }
  return message
}

const escape = (value) => String(value).replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')
const escapeListValue = (value) => escape(value).replaceAll(',', '\\,').replaceAll('|', '\\|')
const escapeRouteValue = (value) => escapeListValue(value).replaceAll('>', '\\>')
const literal = (value) => `[${escape(value)}]`
const semantic = (value) => value.startsWith('~') ? value : literal(value)

function unescape(value) {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '\\') { result += value[index]; continue }
    index += 1
    if (index >= value.length) throw new Error('Incomplete escape sequence')
    result += value[index]
  }
  return result
}

function splitEscaped(value, separator) {
  const result = []; let start = 0; let escaped = false
  for (let index = 0; index < value.length; index += 1) {
    if (escaped) { escaped = false; continue }
    if (value[index] === '\\') { escaped = true; continue }
    if (value[index] === separator) { result.push(value.slice(start, index)); start = index + 1 }
  }
  if (escaped) throw new Error('Incomplete escape sequence')
  result.push(value.slice(start))
  return result
}

function splitSteps(value) {
  const result = []; let start = 0; let depth = 0; let escaped = false
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (escaped) { escaped = false; continue }
    if (char === '\\') { escaped = true; continue }
    if (char === '[') depth += 1
    if (char === ']') depth -= 1
    if (char === ';' && depth === 0) { result.push(value.slice(start, index)); start = index + 1 }
  }
  if (escaped || depth !== 0) throw new Error('Malformed step list')
  result.push(value.slice(start))
  return result
}

function splitFields(text) {
  const result = []; let start = 0; let depth = 0; let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (escaped) { escaped = false; continue }
    if (char === '\\') { escaped = true; continue }
    if (char === '[') depth += 1
    if (char === ']') depth -= 1
    if (char === '|' && depth === 0) { result.push(text.slice(start, index)); start = index + 1 }
  }
  result.push(text.slice(start)); return result
}

function unliteral(value) {
  if (!value.startsWith('[') || !value.endsWith(']')) throw new Error('Text must use brackets')
  return unescape(value.slice(1, -1))
}

function stepsToWire(steps) {
  return steps.map((step) => `${step.id}:${step.a}${semantic(step.x)}${step.ag ? `@${semantic(step.ag)}` : ''}${step.d ? `<${step.d}` : ''}${typeof step.when === 'string' ? `~${step.when}` : ''}${step.ok ? `=${step.ok}` : ''}`).join(';')
}

function confidenceToWire(value) {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e')
  const [integer, fraction = ''] = coefficient.split('.')
  const digits = `${integer}${fraction}`
  const decimalPosition = integer.length + Number(exponent) + 2
  let percent
  if (decimalPosition <= 0) percent = `0.${'0'.repeat(-decimalPosition)}${digits}`
  else if (decimalPosition >= digits.length) percent = `${digits}${'0'.repeat(decimalPosition - digits.length)}`
  else percent = `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`
  return percent.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

function parseSteps(value) {
  return splitSteps(value.slice(1)).map((part) => {
    const match = part.match(/^([^:]+):([^\[~@]+)(?:(~[^<@~=;]+)|\[((?:\\.|[^\]])*)\])(?:@(?:(~[^<@~=;]+)|\[((?:\\.|[^\]])*)\]))?(?:<([^~=]+))?(?:~([^=]+))?(?:=(.*))?$/)
    if (!match) throw new Error(`Invalid step: ${part}`)
    const step = { id: match[1], a: match[2], x: match[3] ?? unliteral(`[${match[4]}]`) }
    if (match[5] || match[6]) step.ag = match[5] ?? unliteral(`[${match[6]}]`)
    if (match[7]) step.d = match[7]
    if (match[8]) step.when = match[8]
    if (match[9]) step.ok = match[9]
    return step
  })
}

export function encode(message, options = {}) {
  validate(message, options)
  const resolvedVocabulary = resolveVocabulary(message.vocab, options)
  const fields = ['A2', message.id, `${escapeRouteValue(message.from)}>${message.to.map(escapeRouteValue).join(',')}`, `${message.i}${confidenceToWire(message.c)}`, message.s, semantic(message.g), `*${vocabularyToWire(message.vocab, options)}`]
  if (message.risk && message.risk !== 'na') fields.push(`!${message.risk}`)
  if (message.ask) fields.push(`?${message.ask}`)
  if (message.by) fields.push(`@${literal(message.by)}`)
  if (message.dep?.length) fields.push(`^${message.dep.map(escapeListValue).join(',')}`)
  if (message.need?.length) fields.push(`+${message.need.map(escapeListValue).join(',')}`)
  if ('n' in message) fields.push(`#${message.n}`)
  {
    // Typed guards live in % while the compact step slot retains literal guards.
    const data = {}
    if (message.quantity) data.quantity = message.quantity
    if (message.prohibition) data.prohibition = message.prohibition
    const guards = Object.fromEntries((message.st ?? []).filter((step) => typeof step.when === 'object').map((step) => [step.id, step.when]))
    if (Object.keys(guards).length) data.guards = guards
    if (Object.keys(data).length) fields.push(`%${Buffer.from(JSON.stringify(canonicalize(data))).toString('base64url')}`)
  }
  if ('eg' in message) fields.push(`&${graphToWire(message.eg)}`)
  if (message.st?.length) fields.push(`>${stepsToWire(message.st)}`)
  return fields.join('|')
}

export function decode(wire, options = {}) {
  if (typeof wire !== 'string' || wire.includes('\n')) throw new Error('A2 wire data must be one line')
  const fields = splitFields(wire)
  if (fields.length < 7 || fields[0] !== 'A2') throw new Error('Invalid A2 frame')
  const [version, id, route, intentConfidence, state, goal, ...optional] = fields
  const confidenceMatch = intentConfidence.match(/^([a-z]+)(\d+(?:\.\d+)?)$/)
  if (!confidenceMatch) throw new Error('Invalid intent/confidence field')
  const intent = confidenceMatch[1]
  const confidence = confidenceMatch[2]
  const routeParts = splitEscaped(route, '>')
  if (routeParts.length !== 2) throw new Error('Route must contain exactly one > separator')
  const message = { v: 2, id, from: unescape(routeParts[0]), to: splitEscaped(routeParts[1], ',').map(unescape), i: intent, c: Number(confidence) / 100, s: state, g: goal.startsWith('~') ? goal : unliteral(goal) }
  const seenTags = new Set()
  let typedFields
  for (const field of optional) {
    const tag = field[0]
    if (seenTags.has(tag)) throw new Error(`Duplicate A2 tag: ${tag}`)
    seenTags.add(tag)
    if (field.startsWith('!')) message.risk = field.slice(1)
    else if (field.startsWith('?')) message.ask = field.slice(1)
    else if (field.startsWith('@')) message.by = field.slice(1).startsWith('[') ? unliteral(field.slice(1)) : field.slice(1)
    else if (field.startsWith('^')) message.dep = splitEscaped(field.slice(1), ',').map(unescape)
    else if (field.startsWith('+')) message.need = splitEscaped(field.slice(1), ',').map(unescape)
    else if (field.startsWith('#')) message.n = field.slice(1)
    else if (field.startsWith('*')) message.vocab = vocabularyFromWire(field.slice(1))
    else if (field.startsWith('%')) {
      const data = Buffer.from(field.slice(1), 'base64url').toString('utf8')
      try { typedFields = JSON.parse(data) } catch { throw new Error('Invalid A2 typed fields') }
      if (Buffer.from(data).toString('base64url') !== field.slice(1) || JSON.stringify(canonicalize(typedFields)) !== data) throw new Error('A2 typed fields must be canonical')
    }
    else if (field.startsWith('&')) message.eg = graphFromWire(field.slice(1))
    else if (field.startsWith('>')) message.st = parseSteps(field)
    else throw new Error(`Unknown A2 tag: ${field}`)
  }
  if (typedFields !== undefined) {
    // Optional tags can arrive in either order, so attach guards after parsing steps.
    if (!typedFields || typeof typedFields !== 'object' || Array.isArray(typedFields)) throw new Error('A2 typed fields must be an object')
    allowedKeys(typedFields, ['guards', 'quantity', 'prohibition'], 'A2 typed fields')
    if (!Object.keys(typedFields).length) throw new Error('A2 typed fields must not be empty')
    if ('quantity' in typedFields) message.quantity = typedFields.quantity
    if ('prohibition' in typedFields) message.prohibition = typedFields.prohibition
    if ('guards' in typedFields) {
      if (!typedFields.guards || typeof typedFields.guards !== 'object' || Array.isArray(typedFields.guards) || !Object.keys(typedFields.guards).length) throw new Error('A2 guards must be a non-empty map')
      for (const [id, guardValue] of Object.entries(typedFields.guards)) {
        const step = message.st?.find((candidate) => candidate.id === id)
        if (!step || 'when' in step) throw new Error(`A2 guard refers to an unknown or guarded step: ${id}`)
        step.when = guardValue
      }
    }
  }
  const resolvedVocabulary = resolveVocabulary(message.vocab, options)
  message.vocab = resolvedVocabulary.data
  if (resolvedVocabulary.manifest.acquire || resolvedVocabulary.manifest.mode !== 'full') message.vocabMeta = resolvedVocabulary.manifest
  return validate(message, options)
}

const meaning = (group, value, vocabulary = dictionary) => {
  const entry = vocabulary.codes[group][canonicalCode(group, value, vocabulary)]
  return typeof entry === 'string' ? entry : entry.en ?? `${entry.ref.ns}:${entry.ref.id}`
}
const conceptMeaning = (value, vocabulary = dictionary) => value.startsWith('~') ? meaning('c', value.slice(1), vocabulary) : value

const graphReference = (reference) => `${reference.ns}:${reference.id}`
const guardMeaning = (value) => `step ${value.step} reports ${value.outcome}`

function renderEventGraph(graph) {
  const entity = (id) => `${id} (${graphReference(graph.e[id].r)})`
  const event = (id) => `${id} (${graphReference(graph.v[id].p)})`
  const roles = { ag: 'agent', pt: 'patient', to: 'recipient', ct: 'quoted content', src: 'source', dst: 'destination', loc: 'location', ins: 'instrument', ben: 'beneficiary' }
  const times = { pa: 'past', pr: 'present', fu: 'future', un: 'unspecified' }
  const aspects = { pf: 'perfective', ip: 'imperfective', pg: 'progressive', un: 'unspecified' }
  const lines = [
    `Entities: ${Object.keys(graph.e).sort().map(entity).join('; ')}.`,
    `Events: ${Object.keys(graph.v).sort().map((id) => {
      const item = graph.v[id]
      const participants = Object.keys(item.a).sort().map((role) => `${roles[role]}=${role === 'ct' ? item.a[role] : entity(item.a[role])}`)
      return `${event(id)}: ${[...participants, 'other roles=unspecified', `time=${times[item.t ?? 'un']}`, `aspect=${aspects[item.x ?? 'un']}`].join(', ')}`
    }).join('; ')}.`,
  ]
  if (graph.q) lines.push(`Quotations: ${Object.keys(graph.q).sort().map((id) => {
    const quote = graph.q[id]
    return `${id}: speaker=${entity(quote.by)}, recipient=${quote.to ? entity(quote.to) : 'unspecified'}, quoted events=${quote.v.map(event).join(', ')}`
  }).join('; ') || 'none'}.`)
  if (graph.o) lines.push(`Possession links: ${graph.o.map((link) => `holder=${entity(link.h)}, possessed=${entity(link.p)}`).join('; ') || 'none'}.`)
  if (graph.c) lines.push(`Claimed causal links: ${graph.c.map((link) => `${event(link.a)} -> ${event(link.b)}`).join('; ') || 'none'}.`)
  return lines.join(' ')
}

export function toEnglish(message) {
  validate(message)
  const messageVocabulary = message.vocab
  const lines = [`Message ${message.id} from ${message.from} to ${message.to.join(', ')}.`, `${meaning('i', message.i, messageVocabulary)}: ${conceptMeaning(message.g, messageVocabulary)}.`, `State: ${meaning('s', message.s, messageVocabulary)}; ${confidenceToWire(message.c)}% confidence.`]
  if (message.risk) lines.push(`Risk: ${meaning('risk', message.risk, messageVocabulary)}.`)
  if (message.by) lines.push(`Deadline: ${message.by}.`)
  if (message.ask) lines.push(`Requested response: ${meaning('ask', message.ask, messageVocabulary)}.`)
  if (message.dep?.length) lines.push(`Depends on messages: ${message.dep.join(', ')}.`)
  if (message.need?.length) lines.push(`Missing information: ${message.need.join('; ')}.`)
  if ('n' in message) lines.push(`Numeric result: ${message.n}.`)
  if (message.quantity) lines.push(`Quantity for goal: ${message.quantity.value} [${graphReference(message.quantity.unit)}].`)
  if (message.prohibition) {
    const rule = message.prohibition
    lines.push(`Conditional prohibition: do not ${meaning('a', rule.a, messageVocabulary)} ${conceptMeaning(rule.x, messageVocabulary)} if ${guardMeaning(rule.when)}${rule.until ? `, until ${guardMeaning(rule.until)}` : ''}.`)
  }
  if (message.eg) lines.push(renderEventGraph(message.eg))
  if (message.st?.length) lines.push(`Plan: ${message.st.map((step, index) => `${index + 1}. ${meaning('a', step.a, messageVocabulary)} ${conceptMeaning(step.x, messageVocabulary)}${step.ag ? ` by ${conceptMeaning(step.ag, messageVocabulary)}` : ''}${step.d ? ` after ${step.d}` : ''}${step.when ? ` when ${typeof step.when === 'string' ? step.when : guardMeaning(step.when)}` : ''}${step.ok ? `; success means ${step.ok}` : ''}`).join(' ')}`)
  return lines.join(' ')
}
