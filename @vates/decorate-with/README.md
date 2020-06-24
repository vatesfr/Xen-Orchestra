<!-- DO NOT EDIT MANUALLY, THIS FILE HAS BEEN GENERATED -->

# @vates/decorate-with

[![Package Version](https://badgen.net/npm/v/@vates/decorate-with)](https://npmjs.org/package/@vates/decorate-with) ![License](https://badgen.net/npm/license/@vates/decorate-with) [![PackagePhobia](https://badgen.net/bundlephobia/minzip/@vates/decorate-with)](https://bundlephobia.com/result?p=@vates/decorate-with) [![Node compatibility](https://badgen.net/npm/node/@vates/decorate-with)](https://npmjs.org/package/@vates/decorate-with)

> Creates a decorator from a function wrapper

## Install

Installation of the [npm package](https://npmjs.org/package/@vates/decorate-with):

```
> npm install --save @vates/decorate-with
```

## Usage

For instance, allows using Lodash's functions as decorators:

```js
import { decorateWith } from '@vates/decorate-with'

class Foo {
  @decorateWith(lodash.debounce, 150)
  bar() {
    // body
  }
}
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
