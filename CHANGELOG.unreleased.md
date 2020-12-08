> This file contains all changes that have not been released yet.
>
> Keep in mind the changelog is addressed to **users** and should be
> understandable by them.

### Enhancements

> Users must be able to say: “Nice enhancement, I'm eager to test it”

- [Plugins] Add user feedback when a plugin test finishes successfully (PR [#5409](https://github.com/vatesfr/xen-orchestra/pull/5409))
- [New HBA SR] Show LUN serial and id in LUN selector (PR [#5422](https://github.com/vatesfr/xen-orchestra/pull/5422))
- [VM/disks, SR/disks] Destroy or forget VDIs: improve tooltip messages (PR [#5435](https://github.com/vatesfr/xen-orchestra/pull/5435))

### Bug fixes

> Users must be able to say: “I had this issue, happy to know it's fixed”

### Packages to release

> Packages will be released in the order they are here, therefore, they should
> be listed by inverse order of dependency.
>
> Rule of thumb: add packages on top.
>
> The format is the following: - `$packageName` `$version`
>
> Where `$version` is
>
> - patch: if the change is a bug fix or a simple code improvement
> - minor: if the change is a new feature
> - major: if the change breaks compatibility
>
> In case of conflict, the highest (lowest in previous list) `$version` wins.

- xo-server minor
- xo-web minor
