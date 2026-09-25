# Security

Found something? Email heilongg23@gmail.com with the details. Please do not
open a public issue for vulnerabilities.

You will get a reply within 72 hours. Fixes ship as a normal release with a
note in the changelog once users have had a chance to update.

Out of scope: rate limiting on the local dev server, anything that needs
physical access to the machine.

## Fetching websites

Match my website fetches pages an admin names. Every address a name resolves
to must be public, and each redirect is checked again. The check and the fetch
look the name up separately, so a name that changes its answer in between
(DNS rebinding) is not caught by the check. On Cloudflare Workers that cannot
reach anything private: outbound fetches only go to the public internet. The
local SQLite mode runs on your own machine, where such a name could reach
services on localhost, so do not expose a local install to the internet.
