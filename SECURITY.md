# Security

## The model

Me-OS is a **single-user app that runs on your own computer**. It has no accounts and no login, because it is not meant
to be reachable by anyone else. Its safety comes from *not being reachable*:

- The server listens on `127.0.0.1` only, so other computers on your network can't connect.
- It rejects any request whose `Host` header isn't `localhost`, `127.0.0.1` or `[::1]`. This blocks DNS-rebinding
  tricks from other websites.
- It sends no CORS headers, so scripts on other websites can't read it from your browser.
- With Docker, the app's port is published on `127.0.0.1` only, and the database isn't published at all.
- Notes are rendered through a sanitiser, so a note can't run script in the page.

## Please don't

- Don't expose it to the internet (port forwarding, a public server, a tunnel). Anyone who reaches it can read and
  change everything, because there is no login.
- Don't change `HOST` to `0.0.0.0` outside a container. The Docker setup does this inside the container only, and
  publishes the port to your computer alone.

## Reporting a problem

Please report security issues privately using GitHub's *Report a vulnerability* (Security tab) rather than a public
issue. Include steps to reproduce. This is a hobby project, so there's no guaranteed response time, but reports are
taken seriously.

## Your data

- It is stored in your own PostgreSQL database. Export and erase buttons are in *Settings → Privacy*.
- The Outlook calendar link (if you set one) is stored in that database in plain text. Treat the database as private.
