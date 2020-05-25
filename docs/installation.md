# Installation

## XOA

Log in to your account and use the deploy form [available on this page](https://xen-orchestra.com/#!/xoa).

:::tip
All the deploy code is within your browser, nothing is sent to our server!
:::

![](./assets/deploy_form.png)

### First Login

Once you have started the VM, you can access the web UI by putting the IP you configured during deployment into your web browser. If you did not configure an IP or are unsure, try one of the following methods to find it:

- Run `xe vm-list params=name-label,networks | grep -A 1 XOA` on your host
- Check your router's DHCP leases for an `xoa` lease

:::tip

- Default Web UI credentials are `admin@admin.net` / `admin`
- Default console/SSH credentials are `xoa` / `xoa` (first login)
  :::

### Registration

**The first thing** you need to do with your XOA is register. [Read the documentation on the page dedicated to the updater/register inferface](updater.md#register).

:::tip
We don't generate virtual appliances every month (unlike XO code itself). It's very likely you'll need to update Xen Orchestra after the initial deploy. You need to register to do so!
:::

### More on XOA

You can get all the info you want on XOA in its [dedicated section](xoa.md).

![](https://xen-orchestra.com/assets/xoa1.png)

## From the sources

:::warning
We don't provide pro support for this installation method. We cannot guarantee anything if it's used in production. Use it at your own risk!
:::

:::tip
Please consider using XOA before trying to play with the manual build, which can be difficult if you are not used to NodeJS and NPM.
:::

This installation has been validated against a fresh Debian 10 (Buster) x64 install. It should be nearly the same on other dpkg systems. For RPM based OS's, it should be close, as most of our dependencies come from NPM and not the OS itself.

As you may have seen in other parts of the documentation, XO is composed of two parts: [xo-server](https://github.com/vatesfr/xen-orchestra/tree/master/packages/xo-server/) and [xo-web](https://github.com/vatesfr/xen-orchestra/tree/master/packages/xo-web/). They can be installed separately, even on different machines, but for the sake of simplicity we will set them up together.

### Packages and Pre-requisites

#### NodeJS

XO needs Node.js. **Please use Node LTS**.

We'll consider at this point that you've got a working node on your box. E.g:

```
$ node -v
v12.16.1
```

If not, see [this page](https://nodejs.org/en/download/package-manager/) for instructions on how to install Node.

#### Yarn

> Yarn is a package manager that offers more guarantees than npm.

See [this page](https://yarnpkg.com/en/docs/install#debian-stable) for instructions on how to install Yarn.

#### Packages

XO needs the following packages to be installed. Redis is used as a database by XO.

For example, on Debian/Ubuntu:

```
$ apt-get install build-essential redis-server libpng-dev git python-minimal libvhdi-utils lvm2 cifs-utils
```

On Fedora/CentOS like:

```
$ dnf install redis libpng-devel git libvhdi-utils lvm2 cifs-utils make automake gcc gcc-c++
```

### Fetching the Code

You need to use the `git` source code manager to fetch the code. Ideally, you should run XO as a non-root user, and if you choose to, you need to set up `sudo` to be able to mount NFS remotes. As your chosen non-root (or root) user, run the following:

```
git clone -b master http://github.com/vatesfr/xen-orchestra
```

:::tip
`xo-server` and `xo-web` have been migrated to the [xen-orchestra](https://github.com/vatesfr/xen-orchestra) mono-repository - so you only need the single clone command above
:::

### Installing dependencies

Now that you have the code, you can enter the `xen-orchestra` directory and use `yarn` to install other dependencies. Then finally build it using `yarn build`. Be sure to run `yarn` commands as the same user you will be using to run Xen Orchestra:

```
$ cd xen-orchestra
$ yarn
$ yarn build
```

Now you have to create a config file for `xo-server`:

```
$ cd packages/xo-server
$ mkdir -p ~/.config/xo-server
$ cp sample.config.toml ~/.config/xo-server/config.toml
```

> Note: If you're installing `xo-server` as a global service, you may want to copy the file to `/etc/xo-server/config.toml` instead.

In this config file, you can change default ports (80 and 443) for xo-server. If you are running the server as a non-root user, you will need to set the port to 1024 or higher.

You can try to start xo-server to see if it works. You should have something like this:

```
$ yarn start
WebServer listening on localhost:80
[INFO] Default user: "admin@admin.net" with password "admin"
```

### Running XO

The only part you need to launch is xo-server, which is quite easy to do. From the `xen-orchestra/packages/xo-server` directory, run the following:

```
$ yarn start
```

That's it! Use your browser to visit the xo-server IP address, and it works! :)

### Updating

If you would like to update your current version, enter your `xen-orchestra` directory and run the following:

```
# This will clear any changes you made in the repository!!
$ git checkout .

$ git pull --ff-only
$ yarn
$ yarn build
```

Then restart Xen Orchestra if it was running.

### Always Running

- You can use [forever](https://github.com/nodejitsu/forever) to have the process always running:

```
yarn global add forever
# Run the below as the user owning XO
forever start bin/xo-server
```

- Or you can use [forever-service](https://github.com/zapty/forever-service) to install XO as a system service, so it starts automatically at boot. Run the following as root:

```
yarn global add forever
yarn global add forever-service
# Be sure to edit the path below to where your install is located!
cd /home/username/xen-orchestra/packages/xo-server/bin/
# Change the username below to the user owning XO
forever-service install orchestra -r username -s xo-server
```

The forever-service command above must be run in the xo-server bin directory. Now you can manage the service, and it will start on boot with the machine:

```
service orchestra start
service orchestra status
```

If you need to delete the service:

```
forever-service delete orchestra
```

### Troubleshooting

If you have problems during the building phase, follow these steps in your `xen-orchestra` directory:

1. `rm -rf node_modules`
1. `yarn`
1. `yarn build`

### FreeBSD

If you are using FreeBSD, you need to install these packages:

```
pkg install gmake redis python git npm node autoconf
```

You can update `npm` itself right now with a `npm update -g`

A few of the npm packages look for system binaries as part of their installation, and if missing will try to build it themselves. Installing these will save some time and allow for easier upgrades later:

```
pkg install jpeg-turbo optipng gifsicle
```

Because FreeBSD is shipped with CLANG and not GCC, you need to do this:

```
ln -s /usr/bin/clang++ /usr/local/bin/g++
```

To enable redis on boot, add this in your `/etc/rc.conf`:

```
redis_enable="YES"
```

Don't forget to start redis if you don't reboot now:

```
service redis start
```

### sudo

If you are running `xo-server` as a non-root user, you need to use `sudo` to be able to mount NFS remotes. You can do this by editing `xo-server` configuration file and setting `useSudo = true`. It's near the end of the file:

```
useSudo = true
```

You need to configure `sudo` to allow the user of your choice to run mount/umount commands without asking for a password. Depending on your operating system / sudo version, the location of this configuration may change. Regardless, you can use:

```
username ALL=(root)NOPASSWD: /bin/mount, /bin/umount
```
