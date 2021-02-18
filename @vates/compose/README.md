<!-- DO NOT EDIT MANUALLY, THIS FILE HAS BEEN GENERATED -->

# @vates/compose

[![Package Version](https://badgen.net/npm/v/@vates/compose)](https://npmjs.org/package/@vates/compose) ![License](https://badgen.net/npm/license/@vates/compose) [![PackagePhobia](https://badgen.net/bundlephobia/minzip/@vates/compose)](https://bundlephobia.com/result?p=@vates/compose) [![Node compatibility](https://badgen.net/npm/node/@vates/compose)](https://npmjs.org/package/@vates/compose)

> Compose functions from left to right

## Install

Installation of the [npm package](https://npmjs.org/package/@vates/compose):

```
> npm install --save @vates/compose
```

## Usage

```js
import { compose } from '@vates/compose'

const add2 = x => x + 2
const mul3 = x => x * 3

// const f = x => mul3(add2(x))
const f = compose(add2, mul3)

console.log(f(5))
// → 21
```

## Contributions

Contributions are _very_ welcomed, either on the documentation or on
the code.

You may:

- report any [issue](https://github.com/vatesfr/xen-orchestra/issues)
  you've encountered;
- fork and create a pull request.

## License

[ISC](https://spdx.org/licenses/ISC) © [Vates SAS](https://vates.fr)
