# Offiqa Privacy Policy

Effective date: September 12, 2026

## Summary

Offiqa is designed to be local-first. It contains no behavioural analytics,
telemetry, advertising SDK, fingerprinting, or cross-site tracking. We do not
sell user data or use it for personalised advertising.

This policy describes the version of Offiqa in this repository. Any access to
the source code, including its network endpoints and Chrome extension
permissions, remains subject to Offiqa's proprietary [LICENSE](LICENSE).

## Data stored locally by default

Workspaces, notes, templates, reminders, focus sessions, client details,
settings, saved tab sessions, optional local research events, and browser-side
account state are stored in the browser's IndexedDB or Chrome local storage.
They are not uploaded merely because Offiqa is installed or opened.

## Optional online features

Offiqa sends information outside the browser only for the features below.

### Offiqa account, billing, and support

If you create or sign in to an Offiqa account, Offiqa sends the authentication
details you enter and account information necessary to authenticate you, check
your entitlement, and provide billing features to `offiqa.com`. Local browser
storage may retain an account token, email address, display name, and profile
image URL for the signed-in session.

If you send a support request, its category, subject, message, and your account
identity are sent to `offiqa.com` so the support team can respond. While you are
signed in, the extension checks the support-thread endpoint about every five
minutes for unread replies. This is a service notification check, not analytics,
but it is a network request associated with your account.

### Google Drive backup and sync

Google Drive backup and sync are optional. When you choose to connect Google
Drive or start a backup, restore, or sync operation, Offiqa uses Google OAuth
with the `drive.file` scope. The selected Offiqa backup data is transferred to
your Google Drive through Google APIs. The extension may contact `offiqa.com`
to exchange an OAuth authorization code for a token; the implementation states
that this token-broker service is not intended to receive Drive file contents.

Google's own privacy terms govern data processed by Google after it reaches
Google services. Do not enable this feature if you do not want backup data sent
to Google.

Offiqa's use and transfer to any other app of information received from Google
APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use
requirements.

### Website favicons and user-opened links

When you add a website link, Offiqa may request that site's hostname from
Google's favicon service to display an icon. Google can therefore receive the
hostname and ordinary connection metadata such as your IP address. Opening a
link or search from Offiqa navigates to the destination you choose, which then
operates under that destination's privacy practices.

## Chrome permissions and page access

Offiqa requests Chrome permissions for its stated features, including replacing
the New Tab page, managing workspace tabs and tab groups, notifications,
shortcuts, optional snippets/autofill, and optional Google sign-in. The broad
website permission is optional: it is requested only after a person enables
snippets or reminders for all sites, or explicitly adds a site. Offiqa does not
send page content, form values, browser history, cookies, or page URLs to
Offiqa for analytics or advertising.

## Your choices

- Do not sign in, connect Google Drive, or submit support requests to use the
  local-first features without those online services.
- Do not grant optional website access unless you need the corresponding
  snippets, autofill, or reminder feature.
- Use Offiqa's data controls to export or erase local data. Removing the
  extension through Chrome also removes its local extension data subject to
  Chrome's behaviour and any separately saved exports or Drive backups.

## Changes to this policy

Any change to the data practices described here must be made publicly in this
repository and reflected in the Chrome Web Store Privacy practices declaration
before the changed release is published.

## Contact

For privacy questions about an Offiqa account or support request, use the
support feature in Offiqa or the contact method listed on offiqa.com.
