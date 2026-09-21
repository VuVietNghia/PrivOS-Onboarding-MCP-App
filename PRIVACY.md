# Privacy Notice

Last updated: 2026-09-21

PrivOS Onboarding MCP App is a stateless application operated by PrivOS AI. It accesses workspace
data only when a user opens its interface in a room, and only through the PrivOS scopes approved
during installation.

## Data handled

The app reads and writes PrivOS Lists in the room where it is installed: one template list per
position, one hire-record list, and one roadmap list per hire. A hire record holds the hire's user
id, position, start date and progress counters. Roadmap tasks hold a name, deadline, owner and a
done flag. When permitted, the app reads the room member list (names and usernames) so HR can pick
a hire. The exact permissions and their purposes are documented in [SCOPES.md](SCOPES.md).

The app has no persistent volume and no database of its own. All onboarding data stays in the
room's isolated PrivOS Lists. A local browser preference stores only the selected visual theme. The
app includes no advertising, behavioral analytics, or third-party tracking SDK.

## Retention and sharing

The app does not retain workspace content after a request beyond the process memory needed to
answer it. Onboarding lists remain in the room until they are deleted there or the installation is
removed. PrivOS platform logs, storage, backups and account records remain governed by the user's
PrivOS agreement and workspace settings. The app does not sell personal data or share workspace
content with any third party.

## User choices and contact

Workspace administrators control installation, approved scopes, and removal of the app. Users
should use their PrivOS account controls for access, correction, export, or deletion requests.
Privacy and security questions can be sent to `dev@privos.ai`.
