<!-- DO NOT EDIT MANUALLY, THIS FILE HAS BEEN GENERATED -->

# complex-matcher [![Build Status](https://travis-ci.org/vatesfr/xen-orchestra.png?branch=master)](https://travis-ci.org/vatesfr/xen-orchestra)

[![Package Version](https://badgen.net/npm/v/complex-matcher)](https://npmjs.org/package/complex-matcher) ![License](https://badgen.net/npm/license/complex-matcher) [![PackagePhobia](https://badgen.net/packagephobia/install/complex-matcher)](https://packagephobia.now.sh/result?p=complex-matcher)

## Install

Installation of the [npm package](https://npmjs.org/package/complex-matcher):

```
> npm install --save complex-matcher
```

## Usage

```js
import * as CM from 'complex-matcher'

const characters = [
  { name: 'Catwoman', costumeColor: 'black' },
  { name: 'Superman', costumeColor: 'blue', hasCape: true },
  { name: 'Wonder Woman', costumeColor: 'blue' },
]

const predicate = CM.parse('costumeColor:blue hasCape?').createPredicate()

characters.filter(predicate)
// [
//   { name: 'Superman', costumeColor: 'blue', hasCape: true },
// ]

new CM.String('foo').createPredicate()
```

## Contributions

Contributions are _very_ welcomed, either on the documentation or on
the code.

You may:

- report any [issue](https://github.com/vatesfr/xen-orchestra/issues)
  you've encountered;
- fork and create a pull request.

## License

[ISC](hhttps://spdx.org/licenses/ISC) © [Vates SAS](https://vates.fr)
