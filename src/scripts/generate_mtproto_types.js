/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// @ts-check
const schema = require(__dirname + '/in/schema.json');
const additional = require(__dirname + '/in/schema_additional_params.json');
const replace = require(__dirname + '/in/schema_replace_types.json');

const mtproto = schema.API;

for(const constructor of additional) {
  constructor.params.forEach(param => {
    param.type = 'flags.-1?' + param.type;
  });

  if(constructor.type) {
    mtproto.constructors.push(constructor);
  }

  const realConstructor = constructor.type ? constructor : mtproto.constructors.find(c => c.predicate == constructor.predicate);

  /* constructor.params.forEach(param => {
    const index = realConstructor.params.findIndex(_param => _param.predicate == param.predicate);
    if(index !== -1) {
      realConstructor.params.splice(index, 1);
    }
  }); */
  realConstructor.params.splice(realConstructor.params.length, 0, ...constructor.params);
}

['Vector t', 'Bool', 'True', 'Null'].forEach(key => {
  let idx = -1;
  do {
    idx = mtproto.constructors.findIndex(c => c.type == key);
    if(idx !== -1) {
      mtproto.constructors.splice(idx, 1);
    } else {
      break;
    }
  } while(true);

  //delete types[key];
});

/** @type {(string: string) => string} */
function capitalizeFirstLetter(string) {
  return string[0].toUpperCase() + string.slice(1);
}

/** @type {(string: string, camelizeFirstLetterIfFound: boolean, camelizeFirstLetterIfNotFound: boolean) => string} */
function camelizeName(string, camelizeFirstLetterIfFound, camelizeFirstLetterIfNotFound = false) {
  if(!string.includes('.')) {
    if(camelizeFirstLetterIfNotFound) {
      string = capitalizeFirstLetter(string);
    }

    return string;
  }

  if(camelizeFirstLetterIfFound) {
    string = capitalizeFirstLetter(string);
  }

  return string.replace(/\../g, (match, index) => {
    return match[1].toUpperCase();
  });
}

/** @type {(type: string, parseBooleanFlags: boolean, overrideTypes?: {[type: string]: string}) => any} */
const processParamType = (type, parseBooleanFlags, overrideTypes) => {
  const isAdditional = type.indexOf('flags.-1?') === 0;
  const isFlag = type.includes('?');
  if(isFlag) {
    type = type.split('?')[1];
  }

  if(type.includes('Vector')) {
    return `Array<${processParamType(type.slice(7, -1), parseBooleanFlags, overrideTypes)}>`;
  }

  const overridden = overrideTypes && overrideTypes[type];
  if(overridden) {
    return overridden;
  }

  switch(type) {
    case '#':
    case 'int':
      return 'number';

    case 'true':
      return parseBooleanFlags ? 'true' : 'boolean';

    case 'Bool':
      return 'boolean';

    case 'double':
      return 'number';

    case 'long': 
      return 'string | number';

    case 'bytes':
      return 'Uint8Array';

    case 'string':
      return 'string';

    case 'X':
    case '!X':
      return 'any';

    default:
      //console.log('no such type', type);
      //throw new Error('no such type: ' + type);
      return isAdditional ? type : camelizeName(type, true);
  }
};

/** @type {(params: {name: string, type: string}[], object: any, parseBooleanFlags: boolean, overrideTypes?: {[type: string]: string}) => any} */
const processParams = (params, object = {}, parseBooleanFlags = true, overrideTypes) => {
  for(const param of params) {
    let {name, type} = param;

    if(type.includes('?') || name == 'flags') {
      name += '?';
    }

    if(replace[name]) {
      type = replace[name];
    }

    const processed = processParamType(type, parseBooleanFlags, overrideTypes);
    if(type.includes('?true') && parseBooleanFlags) {
      if(!object.pFlags) object.pFlags = {};
      object.pFlags[name] = processed;
    } else {
      object[name] = processed;
    }
  }

  return object;
};

/** @type {(object: any) => boolean} */
function isObject(object) {
  return typeof(object) === 'object' && object !== null;
}

/** @type {(object: any, outArray: string[], space: string) => string[]} */
function serializeObject(object, outArray, space) {
  for(const key in object) {
    const value = object[key];

    if(isObject(value)) { // only pFlags
      outArray.push(`${space}${key}?: Partial<{`);
      serializeObject(value, outArray, space + '\t');
      outArray.push(`${space}}>`);
    } else {
      outArray.push(`${space}${key}: ${value}`);
    }
  }

  return outArray;
}

let out = '';
/** @type {Array<{key: 'predicate' | 'method', instanceKey: 'constructors' | 'methods', name: string}>} */
/* const lol = [{key: 'predicate', instanceKey: 'constructors', name: 'Constructor'}, {key: 'method', instanceKey: 'methods', name: 'Method'}];
lol.forEach(info => {
  const {key: keyName, instanceKey, name: mapName} = info; */

/** @type {{[type: string]: string[]}} */
const types = {};
/** @type {{[predicate: string]: any}} */
const constructors = {};
/** @type {{[predicate: string]: string}} */
const constructorsTypes = {};

mtproto.constructors.forEach((constructor) => {
  const {type, predicate, params} = constructor;

  if(!types.hasOwnProperty(type)) {
    types[type] = [];
  }

  types[type].push(predicate);

  constructorsTypes[predicate] = camelizeName(type, true) + '.' + camelizeName(predicate, false);

  // type end

  /** @type {any} */
  const c = {
    _: `'${predicate}'`
  };
  constructors[predicate] = c;

  processParams(params, c, true);

  /* if(predicate == 'inputFileLocation') {
    console.log(c);
  } */
});

for(const type in types) {
  const cs = types[type];

  const camelizedType = camelizeName(type, true);

  const csTypes = cs.map(name => {
    const str = `export type ${camelizeName(name, false)} = {\n`;

    const params = serializeObject(constructors[name], [], '\t\t');

    return str + params.join(',\n').replace(/\{,/g, '{') + '\n\t};';
  });
  

  out += `/**
 * @link https://core.telegram.org/type/${type}
 */
export type ${camelizedType} = ${cs.map(name => camelizedType + '.' + camelizeName(name, false)).join(' | ')};

export namespace ${camelizedType} {
  ${csTypes.join('\n\n\t')}
}

`;

}

  //console.log(types['InputUser']);

out += `export interface ConstructorDeclMap {\n`;
for(const predicate in constructorsTypes) {
  out += `\t'${predicate}': ${constructorsTypes[predicate]},\n`;
}
out += `}\n\n`;

/** @type {{[method: string]: {req: string, res: string}}} */
const methodsMap = {};
// const overrideMethodTypes = {
//   long: 'string | number'
// };
mtproto.methods.forEach((_method) => {
  const {method, type, params} = _method;

  const camelizedMethod = camelizeName(method, true, true);

  methodsMap[method] = {
    req: camelizedMethod, 
    res: processParamType(type, false, {'JSONValue': 'any'}/* , overrideMethodTypes */)
  };

  let str = `export type ${camelizedMethod} = {\n`;

  const object = processParams(params, {}, false/* , overrideMethodTypes */);

  const serialized = serializeObject(object, [], '\t');

  str += serialized.join(',\n').replace(/\{,/g, '{') + '\n};\n\n';
  out += str;
});

out += `export interface MethodDeclMap {\n`;
for(const method in methodsMap) {
  out += `\t'${method}': {req: ${methodsMap[method].req}, res: ${methodsMap[method].res}},\n`;
}
out += `}\n\n`;

const path = process.argv[2];
const writePathTo = (path || __dirname + '/out/') + 'layer.d.ts';
console.log('Writing layer to:', writePathTo);
require('fs').writeFileSync(writePathTo, out);