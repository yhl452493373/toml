'use strict'
module.exports = stringify
module.exports.value = stringifyInline

/**
 *
 * @param obj json object
 * @param options {{separator: string, indentSize: number}} options
 * @returns {string|null}
 */
function stringify(obj, options) {
  if (obj === null) throw typeError('null')
  if (obj === void (0)) throw typeError('undefined')
  if (typeof obj !== 'object') throw typeError(typeof obj)

  if (typeof obj.toJSON === 'function') obj = obj.toJSON()
  if (obj == null) return null
  const type = tomlType(obj)
  if (type !== 'table') throw typeError(type)
  var defaultOptions = {
    separator: '',
    indentSize: 0,
  }
  if (options == null)
    options = defaultOptions
  else
    options = {
      separator: options.separator || defaultOptions.separator,
      indentSize: options.indentSize || defaultOptions.indentSize,
    }

  return stringifyObject('', '', obj, options)
}

function typeError (type) {
  return new Error('Can only stringify objects, not ' + type)
}

function getInlineKeys (obj) {
  return Object.keys(obj).filter(key => isInline(obj[key]))
}
function getComplexKeys (obj) {
  return Object.keys(obj).filter(key => !isInline(obj[key]))
}

function toJSON (obj) {
  let nobj = Array.isArray(obj) ? [] : Object.prototype.hasOwnProperty.call(obj, '__proto__') ? {['__proto__']: undefined} : {}
  for (let prop of Object.keys(obj)) {
    if (obj[prop] && typeof obj[prop].toJSON === 'function' && !('toISOString' in obj[prop])) {
      nobj[prop] = obj[prop].toJSON()
    } else {
      nobj[prop] = obj[prop]
    }
  }
  return nobj
}

function stringifyObject (prefix, indent, obj, options) {
  obj = toJSON(obj)
  let inlineKeys
  let complexKeys
  inlineKeys = getInlineKeys(obj)
  complexKeys = getComplexKeys(obj)
  const result = []
  const inlineIndent = indent || ''
  inlineKeys.forEach(key => {
    var type = tomlType(obj[key])
    if (type !== 'undefined' && type !== 'null') {
      result.push(inlineIndent + stringifyKey(key) + ' = ' + stringifyAnyInline(obj[key], true, options))
    }
  })
  if (result.length > 0) result.push('')
  const complexIndent = prefix && inlineKeys.length > 0 ? (indent + ''.padStart(options.indentSize, ' ')) : ''
  complexKeys.forEach(key => {
    result.push(stringifyComplex(prefix, complexIndent, key, obj[key], options))
  })
  return result.join('\n')
}

function isInline (value) {
  switch (tomlType(value)) {
    case 'undefined':
    case 'null':
    case 'integer':
    case 'nan':
    case 'float':
    case 'boolean':
    case 'string':
    case 'datetime':
      return true
    case 'array':
      return value.length === 0 || tomlType(value[0]) !== 'table'
    case 'table':
      return Object.keys(value).length === 0
    /* istanbul ignore next */
    default:
      return false
  }
}

function tomlType (value) {
  if (value === undefined) {
    return 'undefined'
  } else if (value === null) {
    return 'null'
  /* eslint-disable valid-typeof */
  } else if (typeof value === 'bigint' || (Number.isInteger(value) && !Object.is(value, -0))) {
    return 'integer'
  } else if (typeof value === 'number') {
    return 'float'
  } else if (typeof value === 'boolean') {
    return 'boolean'
  } else if (typeof value === 'string') {
    return 'string'
  } else if ('toISOString' in value) {
    return isNaN(value) ? 'undefined' : 'datetime'
  } else if (Array.isArray(value)) {
    return 'array'
  } else {
    return 'table'
  }
}

function stringifyKey (key) {
  const keyStr = String(key)
  if (/^[-A-Za-z0-9_]+$/.test(keyStr)) {
    return keyStr
  } else {
    return stringifyBasicString(keyStr)
  }
}

function stringifyBasicString (str) {
  return '"' + escapeString(str).replace(/"/g, '\\"') + '"'
}

function stringifyLiteralString (str) {
  return "'" + str + "'"
}

function numpad (num, str) {
  while (str.length < num) str = '0' + str
  return str
}

function escapeString (str) {
  return str.replace(/\\/g, '\\\\')
    .replace(/[\b]/g, '\\b')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\f/g, '\\f')
    .replace(/\r/g, '\\r')
    /* eslint-disable no-control-regex */
    .replace(/([\u0000-\u001f\u007f])/, c => '\\u' + numpad(4, c.codePointAt(0).toString(16)))
    /* eslint-enable no-control-regex */
}

function stringifyMultilineString (str) {
  let escaped = str.split(/\n/).map(str => {
    return escapeString(str).replace(/"(?="")/g, '\\"')
  }).join('\n')
  if (escaped.slice(-1) === '"') escaped += '\\\n'
  return '"""\n' + escaped + '"""'
}

function stringifyAnyInline (value, multilineOk, options) {
  let type = tomlType(value)
  if (type === 'string') {
    if (multilineOk && /\n/.test(value)) {
      type = 'string-multiline'
    } else if (!/[\b\t\n\f\r']/.test(value) && /"/.test(value)) {
      type = 'string-literal'
    }
  }
  return stringifyInline(value, type, options)
}

function stringifyInline (value, type, options) {
  /* istanbul ignore if */
  if (!type) type = tomlType(value)
  switch (type) {
    case 'string-multiline':
      return stringifyMultilineString(value)
    case 'string':
      return stringifyBasicString(value)
    case 'string-literal':
      return stringifyLiteralString(value)
    case 'integer':
      return stringifyInteger(value, options.separator)
    case 'float':
      return stringifyFloat(value, options.separator)
    case 'boolean':
      return stringifyBoolean(value)
    case 'datetime':
      return stringifyDatetime(value)
    case 'array':
      return stringifyInlineArray(value.filter(_ => tomlType(_) !== 'null' && tomlType(_) !== 'undefined' && tomlType(_) !== 'nan'))
    case 'table':
      return stringifyInlineTable(value)
    /* istanbul ignore next */
    default:
      throw typeError(type)
  }
}

function stringifyInteger (value, separator) {
  if(separator!=null && separator !== ''){
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, separator)
  }
  return String(value);
}

function stringifyFloat (value, separator) {
  if (value === Infinity) {
    return 'inf'
  } else if (value === -Infinity) {
    return '-inf'
  } else if (Object.is(value, NaN)) {
    return 'nan'
  } else if (Object.is(value, -0)) {
    return '-0.0'
  }
  const [int, dec] = String(value).split('.')
  return stringifyInteger(int, separator) + '.' + dec
}

function stringifyBoolean (value) {
  return String(value)
}

function stringifyDatetime (value) {
  return value.toISOString()
}

function stringifyInlineArray (values) {
  values = toJSON(values)
  let result = '['
  const stringified = values.map(_ => stringifyInline(_))
  if (stringified.join(', ').length > 60 || /\n/.test(stringified)) {
    result += '\n  ' + stringified.join(',\n  ') + '\n'
  } else {
    result += ' ' + stringified.join(', ') + (stringified.length > 0 ? ' ' : '')
  }
  return result + ']'
}

function stringifyInlineTable (value) {
  value = toJSON(value)
  const result = []
  Object.keys(value).forEach(key => {
    result.push(stringifyKey(key) + ' = ' + stringifyAnyInline(value[key], false))
  })
  return '{ ' + result.join(', ') + (result.length > 0 ? ' ' : '') + '}'
}

function stringifyComplex (prefix, indent, key, value, options) {
  const valueType = tomlType(value)
  /* istanbul ignore else */
  if (valueType === 'array') {
    return stringifyArrayOfTables(prefix, indent, key, value, options)
  } else if (valueType === 'table') {
    return stringifyComplexTable(prefix, indent, key, value, options)
  } else {
    throw typeError(valueType)
  }
}

function stringifyArrayOfTables (prefix, indent, key, values, options) {
  values = toJSON(values)
  const firstValueType = tomlType(values[0])
  /* istanbul ignore if */
  if (firstValueType !== 'table') throw typeError(firstValueType)
  const fullKey = prefix + stringifyKey(key)
  let result = ''
  values.forEach(table => {
    if (result.length > 0) result += '\n'
    result += indent + '[[' + fullKey + ']]\n'
    result += stringifyObject(fullKey + '.', indent, table, options)
  })
  return result
}

function stringifyComplexTable (prefix, indent, key, value, options) {
  const fullKey = prefix + stringifyKey(key)
  let result = ''
  if (getInlineKeys(value).length > 0) {
    result += indent + '[' + fullKey + ']\n'
  }
  return result + stringifyObject(fullKey + '.', indent, value, options)
}
