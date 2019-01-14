# xo-server-auth-saml [![Build Status](https://travis-ci.org/vatesfr/xen-orchestra.png?branch=master)](https://travis-ci.org/vatesfr/xen-orchestra)

> SAML authentication plugin for XO-Server

This plugin allows SAML users to authenticate to Xen-Orchestra.

The first time a user signs in, XO will create a new XO user with the
same identifier.

## Install

For installing XO and the plugins from the sources, please take a look at [the documentation](https://xen-orchestra.com/docs/from_the_sources.html).

## Usage

> This plugin is based on [passport-saml](https://github.com/bergie/passport-saml),
> see [its documentation](https://github.com/bergie/passport-saml#configure-strategy)
> for more information about the configuration.

Like all other xo-server plugins, it can be configured directly via
the web interface, see [the plugin documentation](https://xen-orchestra.com/docs/plugins.html).

> Important: When registering your instance to your identity provider,
> you must configure its callback URL to
> `http://xo.company.net/signin/saml/callback`!

## Development

```
# Install dependencies
> npm install

# Run the tests
> npm test

# Continuously compile
> npm run dev

# Continuously run the tests
> npm run dev-test

# Build for production (automatically called by npm install)
> npm run build
```

## Contributions

Contributions are *very* welcomed, either on the documentation or on
the code.

You may:

- report any [issue](https://github.com/vatesfr/xen-orchestra/issues)
  you've encountered;
- fork and create a pull request.

## License

AGPL3 © [Vates SAS](http://vates.fr)
