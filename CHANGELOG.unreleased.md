> This file contains all changes that have not been released yet.
>
> Keep in mind the changelog is addressed to **users** and should be
> understandable by them.

### Enhancements

> Users must be able to say: “Nice enhancement, I'm eager to test it”

- [Settings/Logs] Differenciate XS/XCP-ng errors from XO errors [#4101](https://github.com/vatesfr/xen-orchestra/issues/4101) (PR [#4385](https://github.com/vatesfr/xen-orchestra/pull/4385))
- [Backups] Improve performance by caching logs consolidation (PR [#4541](https://github.com/vatesfr/xen-orchestra/pull/4541))
- [New VM] Cloud Init available for all plans (PR [#4543](https://github.com/vatesfr/xen-orchestra/pull/4543))
- [Servers] IPv6 addresses can be used [#4520](https://github.com/vatesfr/xen-orchestra/issues/4520) (PR [#4521](https://github.com/vatesfr/xen-orchestra/pull/4521)) \
  Note: They must enclosed in brackets to differentiate with the port, e.g.: `[2001:db8::7334]` or `[ 2001:db8::7334]:4343`

### Bug fixes

> Users must be able to say: “I had this issue, happy to know it's fixed”

- [Host] Fix an issue where host was wrongly reporting time inconsistency (PR [#4540](https://github.com/vatesfr/xen-orchestra/pull/4540))

### Released packages

> Packages will be released in the order they are here, therefore, they should
> be listed by inverse order of dependency.
>
> Rule of thumb: add packages on top.

- xen-api v0.27.2
- xo-server v5.51.0
- xo-web v5.51.0
