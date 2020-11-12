> This file contains all changes that have not been released yet.
>
> Keep in mind the changelog is addressed to **users** and should be
> understandable by them.

### Enhancements

> Users must be able to say: “Nice enhancement, I'm eager to test it”

- [LDAP] Prevent LDAP-provided groups from being edited from XO [#1884](https://github.com/vatesfr/xen-orchestra/issues/1884) (PR [#5351](https://github.com/vatesfr/xen-orchestra/pull/5351))
- [Licensing] Allow Free and Starter users to copy VMs and create a VM from snapshot on the same pool [#4890](https://github.com/vatesfr/xen-orchestra/issues/4890) (PR [5333](https://github.com/vatesfr/xen-orchestra/pull/5333))

### Bug fixes

> Users must be able to say: “I had this issue, happy to know it's fixed”

- [Remotes/NFS] Only mount with `vers=3` when no other options [#4940](https://github.com/vatesfr/xen-orchestra/issues/4940) (PR [#5354](https://github.com/vatesfr/xen-orchestra/pull/5354))
- [VM/network] Don't change VIF's locking mode automatically (PR [#5357](https://github.com/vatesfr/xen-orchestra/pull/5357))
- [Import OVA] Fix 'Max payload size exceeded' error when importing huge OVAs (PR [#5372](https://github.com/vatesfr/xen-orchestra/pull/5372))

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

- @vates/multi-key-map minor
- @xen-orchestra/fs patch
- vhd-lib major
- xo-vmdk-to-vhd major
- xo-server minor
- xo-web minor
