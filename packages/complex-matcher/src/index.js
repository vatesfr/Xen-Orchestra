import { escapeRegExp, isPlainObject, some } from 'lodash'

// ===================================================================

const RAW_STRING_CHARS = (() => {
  const chars = { __proto__: null }
  const add = (a, b = a) => {
    let i = a.charCodeAt(0)
    const j = b.charCodeAt(0)
    while (i <= j) {
      chars[String.fromCharCode(i++)] = true
    }
  }
  add('$')
  add('-')
  add('.')
  add('0', '9')
  add('_')
  add('A', 'Z')
  add('a', 'z')
  return chars
})()
const isRawString = string => {
  const { length } = string
  for (let i = 0; i < length; ++i) {
    if (!(string[i] in RAW_STRING_CHARS)) {
      return false
    }
  }
  return true
}

// -------------------------------------------------------------------

class Node {
  createPredicate() {
    return value => this.match(value)
  }
}

export class Null extends Node {
  match() {
    return true
  }

  toString() {
    return ''
  }
}

const formatTerms = terms => terms.map(term => term.toString(true)).join(' ')

export class And extends Node {
  constructor(children) {
    super()

    if (children.length === 1) {
      return children[0]
    }
    this.children = children
  }

  match(value) {
    return this.children.every(child => child.match(value))
  }

  toString(isNested) {
    const terms = formatTerms(this.children)
    return isNested ? `(${terms})` : terms
  }
}

export class Comparison extends Node {
  constructor(operator, value) {
    super()
    this._comparator = Comparison.comparators[operator]
    this._operator = operator
    this._value = value
  }

  match(value) {
    return typeof value === 'number' && this._comparator(value, this._value)
  }

  toString() {
    return this._operator + String(this._value)
  }
}
Comparison.comparators = {
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
}

export class Or extends Node {
  constructor(children) {
    super()

    if (children.length === 1) {
      return children[0]
    }
    this.children = children
  }

  match(value) {
    return this.children.some(child => child.match(value))
  }

  toString() {
    return `|(${formatTerms(this.children)})`
  }
}

export class Not extends Node {
  constructor(child) {
    super()

    this.child = child
  }

  match(value) {
    return !this.child.match(value)
  }

  toString() {
    return '!' + this.child.toString(true)
  }
}

export class NumberNode extends Node {
  constructor(value) {
    super()

    this.value = value

    // should not be enumerable for the tests
    Object.defineProperty(this, 'match', {
      value: this.match.bind(this),
    })
  }

  match(value) {
    return (
      value === this.value ||
      (value !== null && typeof value === 'object' && some(value, this.match))
    )
  }

  toString() {
    return String(this.value)
  }
}
export { NumberNode as Number }

export class NumberOrStringNode extends Node {
  constructor(value) {
    super()

    this.value = value

    // should not be enumerable for the tests
    Object.defineProperty(this, 'match', {
      value: this.match.bind(this, value.toLowerCase(), +value),
    })
  }

  match(lcValue, numValue, value) {
    return (
      value === numValue ||
      (typeof value === 'string'
        ? value.toLowerCase().indexOf(lcValue) !== -1
        : (Array.isArray(value) || isPlainObject(value)) &&
          some(value, this.match))
    )
  }

  toString() {
    return this.value
  }
}
export { NumberOrStringNode as NumberOrString }

export class Property extends Node {
  constructor(name, child) {
    super()

    this.name = name
    this.child = child
  }

  match(value) {
    return value != null && this.child.match(value[this.name])
  }

  toString() {
    return `${formatString(this.name)}:${this.child.toString(true)}`
  }
}

const escapeChar = char => '\\' + char
const formatString = value =>
  Number.isNaN(+value)
    ? isRawString(value)
      ? value
      : `"${value.replace(/\\|"/g, escapeChar)}"`
    : `"${value}"`

export class GlobPattern extends Node {
  constructor(value) {
    // fallback to string node if no wildcard
    if (value.indexOf('*') === -1) {
      return new StringNode(value)
    }

    super()

    this.value = value

    // should not be enumerable for the tests
    Object.defineProperty(this, 'match', {
      value: this.match.bind(
        this,
        new RegExp(
          value
            .split('*')
            .map(escapeRegExp)
            .join('.*'),
          'i'
        )
      ),
    })
  }

  match(re, value) {
    if (typeof value === 'string') {
      return re.test(value)
    }

    if (Array.isArray(value) || isPlainObject(value)) {
      return some(value, this.match)
    }

    return false
  }

  toString() {
    return this.value
  }
}

export class RegExpNode extends Node {
  constructor(pattern, flags) {
    super()

    this.re = new RegExp(pattern, flags)

    // should not be enumerable for the tests
    Object.defineProperty(this, 'match', {
      value: this.match.bind(this),
    })
  }

  match(value) {
    if (typeof value === 'string') {
      return this.re.test(value)
    }

    if (Array.isArray(value) || isPlainObject(value)) {
      return some(value, this.match)
    }

    return false
  }

  toString() {
    return this.re.toString()
  }
}
export { RegExpNode as RegExp }

export class StringNode extends Node {
  constructor(value) {
    super()

    this.value = value

    // should not be enumerable for the tests
    Object.defineProperty(this, 'match', {
      value: this.match.bind(this, value.toLowerCase()),
    })
  }

  match(lcValue, value) {
    if (typeof value === 'string') {
      return value.toLowerCase().indexOf(lcValue) !== -1
    }

    if (Array.isArray(value) || isPlainObject(value)) {
      return some(value, this.match)
    }

    return false
  }

  toString() {
    return formatString(this.value)
  }
}
export { StringNode as String }

export class TruthyProperty extends Node {
  constructor(name) {
    super()

    this.name = name
  }

  match(value) {
    return value != null && !!value[this.name]
  }

  toString() {
    return formatString(this.name) + '?'
  }
}

// -------------------------------------------------------------------

// https://gist.github.com/yelouafi/556e5159e869952335e01f6b473c4ec1

class Failure {
  constructor(pos, expected) {
    this.expected = expected
    this.pos = pos
  }

  get value() {
    throw new Error(
      `parse error: expected ${this.expected} at position ${this.pos}`
    )
  }
}

class Success {
  constructor(pos, value) {
    this.pos = pos
    this.value = value
  }
}

// -------------------------------------------------------------------

class P {
  static alt(...parsers) {
    const { length } = parsers
    return new P((input, pos, end) => {
      for (let i = 0; i < length; ++i) {
        const result = parsers[i]._parse(input, pos, end)
        if (result instanceof Success) {
          return result
        }
      }
      return new Failure(pos, 'alt')
    })
  }

  static grammar(rules) {
    const grammar = {}
    Object.keys(rules).forEach(k => {
      const rule = rules[k]
      grammar[k] = rule instanceof P ? rule : P.lazy(rule, grammar)
    })
    return grammar
  }

  static lazy(parserCreator, arg) {
    const parser = new P((input, pos, end) =>
      (parser._parse = parserCreator(arg)._parse)(input, pos, end)
    )
    return parser
  }

  static regex(regex) {
    regex = new RegExp(regex.source, 'y')
    return new P((input, pos) => {
      regex.lastIndex = pos
      const matches = regex.exec(input)
      return matches !== null
        ? new Success(regex.lastIndex, matches[0])
        : new Failure(pos, regex)
    })
  }

  static seq(...parsers) {
    const { length } = parsers
    return new P((input, pos, end) => {
      const values = new Array(length)
      for (let i = 0; i < length; ++i) {
        const result = parsers[i]._parse(input, pos, end)
        if (result instanceof Failure) {
          return result
        }
        pos = result.pos
        values[i] = result.value
      }
      return new Success(pos, values)
    })
  }

  static text(text) {
    const { length } = text
    return new P((input, pos) =>
      input.startsWith(text, pos)
        ? new Success(pos + length, text)
        : new Failure(pos, `'${text}'`)
    )
  }

  constructor(parse) {
    this._parse = parse
  }

  map(fn) {
    return new P((input, pos, end) => {
      const result = this._parse(input, pos, end)
      if (result instanceof Success) {
        result.value = fn(result.value)
      }
      return result
    })
  }

  parse(input, pos = 0, end = input.length) {
    return this._parse(input, pos, end).value
  }

  repeat(min = 0, max = Infinity) {
    return new P((input, pos, end) => {
      const value = []
      let result
      let i = 0
      while (i < min) {
        ++i
        result = this._parse(input, pos, end)
        if (result instanceof Failure) {
          return result
        }
        value.push(result.value)
        pos = result.pos
      }
      while (
        i < max &&
        (result = this._parse(input, pos, end)) instanceof Success
      ) {
        ++i
        value.push(result.value)
        pos = result.pos
      }
      return new Success(pos, value)
    })
  }

  skip(otherParser) {
    return new P((input, pos, end) => {
      const result = this._parse(input, pos, end)
      if (result instanceof Failure) {
        return result
      }
      const otherResult = otherParser._parse(input, result.pos, end)
      if (otherResult instanceof Failure) {
        return otherResult
      }
      result.pos = otherResult.pos
      return result
    })
  }
}

P.eof = new P((input, pos, end) =>
  pos < end ? new Failure(pos, 'end of input') : new Success(pos)
)

// -------------------------------------------------------------------

const parser = P.grammar({
  default: r =>
    P.seq(r.ws, r.term.repeat(), P.eof).map(([, terms]) =>
      terms.length === 0 ? new Null() : new And(terms)
    ),
  globPattern: new P((input, pos, end) => {
    let value = ''
    let c
    while (pos < end && ((c = input[pos]) === '*' || c in RAW_STRING_CHARS)) {
      ++pos
      value += c
    }
    return value.length === 0
      ? new Failure(pos, 'a raw string')
      : new Success(pos, value)
  }),
  quotedString: new P((input, pos, end) => {
    if (input[pos] !== '"') {
      return new Failure(pos, '"')
    }
    ++pos

    const value = []
    let char
    while (pos < end && (char = input[pos++]) !== '"') {
      if (char === '\\') {
        char = input[pos++]
      }
      value.push(char)
    }

    return new Success(pos, value.join(''))
  }),
  property: r => P.alt(r.quotedString, r.rawString),
  rawString: new P((input, pos, end) => {
    let value = ''
    let c
    while (pos < end && RAW_STRING_CHARS[(c = input[pos])]) {
      ++pos
      value += c
    }
    return value.length === 0
      ? new Failure(pos, 'a raw string')
      : new Success(pos, value)
  }),
  regex: new P((input, pos, end) => {
    if (input[pos] !== '/') {
      return new Failure(pos, '/')
    }
    ++pos

    let c

    let pattern = ''
    let escaped = false
    while (pos < end && ((c = input[pos++]) !== '/' || escaped)) {
      escaped = c === '\\'
      pattern += c
    }

    if (c !== '/') {
      return new Failure(pos, '/')
    }

    let flags = ''
    if (pos < end && (c = input[pos]) === 'i') {
      ++pos
      flags += c
    }

    return new Success(pos, new RegExpNode(pattern, flags))
  }),
  term: r =>
    P.alt(
      P.seq(P.text('('), r.ws, r.term.repeat(1), P.text(')')).map(
        _ => new And(_[2])
      ),
      P.seq(
        P.text('|'),
        r.ws,
        P.text('('),
        r.ws,
        r.term.repeat(1),
        P.text(')')
      ).map(_ => new Or(_[4])),
      P.seq(P.text('!'), r.ws, r.term).map(_ => new Not(_[2])),
      P.seq(P.regex(/[<>]=?/), r.rawString).map(([op, val]) => {
        val = +val
        if (Number.isNaN(val)) {
          throw new TypeError('value must be a number')
        }
        return new Comparison(op, val)
      }),
      P.seq(r.property, r.ws, P.text(':'), r.ws, r.term).map(
        _ => new Property(_[0], _[4])
      ),
      P.seq(r.property, P.text('?')).map(_ => new TruthyProperty(_[0])),
      r.value
    ).skip(r.ws),
  value: r =>
    P.alt(
      r.quotedString.map(_ => new StringNode(_)),
      r.regex,
      r.globPattern.map(str => {
        const asNum = +str
        return Number.isNaN(asNum)
          ? new GlobPattern(str)
          : new NumberOrStringNode(str)
      })
    ),
  ws: P.regex(/\s*/),
}).default
export const parse = parser.parse.bind(parser)

// -------------------------------------------------------------------

const _getPropertyClauseStringsOrRegex = ({ child }) => {
  if (child instanceof Or) {
    const strings = []
    child.children.forEach(child => {
      if (child instanceof StringNode) {
        strings.push(child.value)
      }
      if (child instanceof RegExpNode) {
        strings.push(child.re.source.replace(/^(\^)|\\|\$$/g, ''))
      }
    })
    return strings
  }

  if (child instanceof StringNode) {
    return [child.value]
  }
  if (child instanceof RegExpNode) {
    return [child.re.source.replace(/^(\^)|\\|\$$/g, '')]
  }

  return []
}

// Find possible values for property clauses in a and clause.
export const getPropertyClausesStringsOrRegex = node => {
  if (!node) {
    return {}
  }

  if (node instanceof Property) {
    return {
      [node.name]: _getPropertyClauseStringsOrRegex(node),
    }
  }

  if (node instanceof And) {
    const strings = {}
    node.children.forEach(node => {
      if (node instanceof Property) {
        const { name } = node
        const values = strings[name]
        if (values) {
          values.push.apply(values, _getPropertyClauseStringsOrRegex(node))
        } else {
          strings[name] = _getPropertyClauseStringsOrRegex(node)
        }
      }
    })
    return strings
  }

  return {}
}

// -------------------------------------------------------------------

export const setPropertyClause = (node, name, child) => {
  const property =
    child &&
    new Property(
      name,
      typeof child === 'string' ? new StringNode(child) : child
    )

  if (node === undefined) {
    return property
  }

  const children = (node instanceof And ? node.children : [node]).filter(
    child => !(child instanceof Property && child.name === name)
  )
  if (property !== undefined) {
    children.push(property)
  }
  return new And(children)
}
