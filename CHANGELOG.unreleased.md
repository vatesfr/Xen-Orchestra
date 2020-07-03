> This file contains all changes that have not been released yet.
>
> Keep in mind the changelog is addressed to **users** and should be
> understandable by them.

### Enhancements

> Users must be able to say: “Nice enhancement, I'm eager to test it”

- [Home] Remove 'tags' filter from the filter selector since tags have their own selector (PR [#5121](https://github.com/vatesfr/xen-orchestra/pull/5121))
- [Backup/New] Add "XOA Proxy" to the excluded tags by default (PR [#5128](https://github.com/vatesfr/xen-orchestra/pull/5128))
- [Backup/overview] Don't open backup job edition in a new tab (PR [#5130](https://github.com/vatesfr/xen-orchestra/pull/5130))

### Bug fixes

> Users must be able to say: “I had this issue, happy to know it's fixed”

- [Restore legacy, File restore legacy] Fix mount error in case of existing proxy remotes (PR [#5124](https://github.com/vatesfr/xen-orchestra/pull/5124))
- [File restore] Don't fail with `TypeError [ERR_INVALID_ARG_TYPE]` on LVM partitions
- [Import/OVA] Fix import of bigger OVA files (>8GB .vmdk disk) (PR [#5129](https://github.com/vatesfr/xen-orchestra/pull/5129))

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

- xo-vmdk-to-vhd patch
- xo-server minor
- xo-web minor
