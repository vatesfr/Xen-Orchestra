# Users

:::tip
For system users (in XOA), please refer to [XOA section](xoa.md). Here, we are only talking about users in Xen Orchestra application
:::

There are 2 types of XO users:

- **admins**, with all rights on all connected resources
- **users**, with no rights by default

## Authentication

Xen Orchestra supports various types of user authentication, internal or even external thanks to the usage of the [Passport library](http://passportjs.org/).

:::tip
Any account created by an external authentication process (LDAP, SSO...) will be a **user** without any permission.
Also, you don't have to create an external user by yourself: it will be created automatically in Xen Orchestra after its first connection.
:::

### Built-in

This is the default method. Creating a user is very simple:

1. Go into the Settings view, select "Users"
2. You can create a _user_ or an _admin_, with their password (or generate one)

![](./assets/usercreation.png)

By default, a _user_ won't have any permissions. At the opposite, an _admin_ will have all rights.

### LDAP

XO currently supports connections to LDAP directories, like _Open LDAP_ or _Active Directory_.

To configure your LDAP, you need to go into the _Plugins_ section in the "Settings" view. Then configure it:

![LDAP plugin settings](./assets/ldapconfig.png)

Don't forget to save the configuration, and also check if the plugin is activated (green button on top).

#### Filters

LDAP Filters allow you to properly match your user. It's not an easy task to always find the right filter, and it entirely depends on your LDAP configuration. Still, here is a list of common filters:

- `'(uid={{name}})'` is usually the default filter for _Open LDAP_
- `'(cn={{name}})'`, `'(sAMAccountName={{name}})'`, `'(sAMAccountName={{name}}@<domain>)'` or even `'(userPrincipalName={{name}})'` are widely used for _Active Directory_. Please check with your AD Admin to find the right one.

After finishing the configuration, you can try to log in with your LDAP username and password. Finally, right after your initial successful log in, your account will be visible in the user list of Xen Orchestra.

### SAML

This plugin allows SAML users to authenticate to Xen-Orchestra.

The first time a user signs in, XO will create a new XO user with the same identifier.

#### Configuration

In the "Settings" then "Plugins" view, expand the SAML plugin configuration. Then provide the needed fields:

![](./assets/samlconfig.png)

Save the configuration and then activate the plugin (button on top).

:::warning
When registering your instance to your identity provider, you must configure its callback URL to `http://xo.example.net/signin/saml/callback`!
:::

### GitHub

This plugin allows GitHub users to authenticate to Xen-Orchestra.

The first time a user signs in, XO will create a new XO user with the same identifier, without any permissions.

First you need to configure a new app in your GitHub account:

![](https://raw.githubusercontent.com/vatesfr/xen-orchestra/master/packages/xo-server-auth-github/github.png)

When you get your `clientID` and your `clientSecret`, you can configure them in the GitHub Plugin inside the "Settings/Plugins" view of Xen Orchestra.

Be sure to activate the plugin after you save the configuration (button on top). When it's done, you'll see a link in the login view, this is where you'll go to authenticate:

![](./assets/githubconfig.png)

### Google

This plugin allows Google users to authenticate to Xen-Orchestra.

The first time a user signs in, XO will create a new XO user with the same identifier, without any permissions.

#### Creating the Google project

[Create a new project](https://console.developers.google.com/project):

![](https://raw.githubusercontent.com/vatesfr/xen-orchestra/master/packages/xo-server-auth-google/create-project-2.png)

Enable the Google+ API:

![](https://raw.githubusercontent.com/vatesfr/xen-orchestra/master/packages/xo-server-auth-google/enable-google+-api.png)

Add OAuth 2.0 credentials:

![](https://raw.githubusercontent.com/vatesfr/xen-orchestra/master/packages/xo-server-auth-google/add-oauth2-credentials.png)
![](https://raw.githubusercontent.com/vatesfr/xen-orchestra/master/packages/xo-server-auth-google/add-oauth2-credentials-2.png)

#### Configure the XO plugin

In Settings, then Plugins, expand the Google plugin detail and provide:

- a `clientID` e.g `326211154583-nt2s112d3t7f4f1hh49oo9164nivvbnu.apps.googleusercontent.com`
- a `clientSecret`, e.g `HTDb8I4jXiLRMaRL15qCffQ`
- the `callbackURL`, e.g `http://xo.company.net/signin/google/callback`

![](./assets/googleconfig.png)

Be sure to activate the plugin after you save the configuration (button on top).

You can now connect with your Google account in the login page.

## ACLs

:::tip
ACLs are permissions that apply to pre-existing objects. Only a super admin (XO administrator) can create objects.
:::

ACLs are the permissions for your users or groups. The ACLs view can be accessed in the "Settings" panel.

1. Select the user or group you want to apply permissions on
2. Select the object on which the permission will apply
3. Choose the role for this ACL
4. Click on "Create"

![](./assets/createacl.png)

:::tip
You can click to add multiple objects at the same time!
:::

Your ACL is now available in the right list:

![](./assets/acllist.png)

You can edit/remove existing ACLs here.

### Roles

There are 3 different roles for your users:

- Admin
- Operator
- Viewer

#### Admin

An object admin can do everything on it, even destroy it. E.g with its admin VM:

- remove it
- migrate it (to a host with admin permission on it)
- modify the VM resources, name and description
- clone it
- copy it
- convert it into a template
- snapshot it (even revert from a snapshot)
- export it
- attach/add visible disks
- same for network cards

#### Operator

An operator can make everyday operations on assigned objects. E.g on a VM:

- eject a CD
- insert a CD (if he can view the ISO storage repository)
- start, restart, shutdown, suspend/resume it

All other operations are forbidden.

#### Viewer

A viewer can only see the VM state and its metrics. That's all!

### Inheritance

Objects have a hierarchy: a Pool contains all its hosts, containing itself all its VMs.

If you give a _view_ permission to a user (or a group) on a pool, he will automatically see all the objects inside this pool (SRs, hosts, VMs).

### Examples

#### Allow a user to install an OS

If the OS install needs an ISO, you need to give this user 2 permissions:

- _Operate_ on the VM (e.g to start it)
- _View_ on the ISO Storage containing the needed ISO.

## Self-service portal

The self-service feature allows users to create new VMs. This is different from delegating existing resources (VM's) to them, and it leads to a lot of possibilities.

### Set of resources

To create a new set of resources to delegate, go to the "Self Service" section in the main menu:

![](./assets/selfservice_menu.png)

#### Create a set

:::tip
Only an admin can create a set of resources
:::

To allow people to create VMs as they want, we need to give them a _part_ of your XenServer resources (disk space, CPUs, RAM). You can call this "general quotas" if you like. But you first need to decide which resources will be used.

In this example below, we'll create a set called **"sandbox"** with:

- "devs" is the group that can use this set (all users in the group)
- "Lab Pool" is the pool where they can play
- "Debian 8 Cloud Ready" is the only template they can use
- "SSD NFS" is the only SR where they can create VMs
- "Pool-wide network with eth0" is the only available network for them

![](./assets/selfserviceset.png)

As you can see, only compatible hosts are shown and can be used for this resource set (hosts in another pool aren't shown). This way, you can be sure to have resources free for tasks other than self-service.

:::tip
Don't forget to add an ISO SR to allow your users to install VMs with CD if necessary
:::

##### Quotas

Then, you can define quotas on this set:

- max vCPUs
- max RAM
- max disk usage

:::tip
Replicated VMs and snapshots created by a backup job don't use quotas.
:::

:::tip
A snapshot of a Self Service VM will use as much resources as a VM would. You can disable this by setting `ignoreVmSnapshotResources` to `true` in the `selfService` section of `xo-server`'s config.
:::

When you click on create, you can see the resource set and remove or edit it:

![](./assets/selfservice_recap_quotas.png)

### Usage (user side)

As soon as a user is granted a resource set, it displays a new button in their main view: "new".

![](./assets/selfservice_new_vm.png)

Now, the user can create a VM with only the resources granted in the set:

![](./assets/selfservice_create_vm.png)

And the recap before creation:

![](./assets/selfservice_summary_quotas.png)

If the "Create" button is disabled, it means the user requested more resources than available.

Finally, if a user has been granted access to multiple resource sets, they can be switched in the top right of the screen.

### Toward the Cloud

Self-service is a major step in the Cloud. Combine it with our [Cloudinit compatible VM creation](cloudinit.md) for a full experience:

- create a Cloud ready template
- create a set and put Cloud templates inside
- delegate this set to a group of users

Now, your authorized users can create VMs with their SSH keys, grow template disks if needed, etc. Everything is inside a "sandbox" (the resource set) you defined earlier!

![](https://pbs.twimg.com/media/CYMt2cJUkAAWCPg.png)

## Debugging

If you can't log in, please check the logs of `xo-server` while you attempt to connect. It will give you hints about the error encountered. You can do that with a `tail -f /var/log/syslog -n 100` on your XOA.
