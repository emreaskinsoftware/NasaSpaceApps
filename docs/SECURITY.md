# Security notes

Scope: a research prototype that stores **synthetic data only**. This file states what is protected, what was reviewed, and what is not covered.

## Threat model in brief

| Asset | Exposure | Control |
|---|---|---|
| Web app (static PWA) | Malicious imported file, hostile text in a ground reply or case package, hostile page on another origin | No HTML sinks (lint-enforced ban on `innerHTML`/`dangerouslySetInnerHTML`/`eval`); strict CSP; schema validation and size caps on every import; React text rendering only |
| Local gateway / ground | Other local processes, pages on other origins (CSRF, DNS rebinding, cross-site WebSocket hijacking), a hostile ground endpoint | Loopback bind by default; Host and Origin allow-lists on HTTP and WebSocket upgrade; bearer token (constant-time compare) required for any non-loopback bind; body limits, timeouts, rate limit, bounded stores, parameterised SQL |
| Scientific integrity | Simulator truth leaking into inference; simulated data labelled as real | Engine imports contracts only (lint + unit test); truth kept in a separate store; origin stamped at the trust boundary; simulator always emits `simulated` |

## Controls

- **Content-Security-Policy** (meta tag injected at build): `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; connect-src 'self'` plus loopback port 4310. `apps/web/public/_headers` adds `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` for hosts that honour that file; a static host must send these as real headers because `frame-ancestors` is ignored in a meta tag.
- **No dynamic code:** the schema library is configured not to probe `new Function` (`z.config({ jitless: true })`), so the app raises no CSP violation in any engine; found by running the suite in Firefox.
- **No remote resources:** fonts, scenarios and translations are bundled; an automated test asserts that no request leaves the origin during a full offline run.
- **Validation:** zod schemas with bounded arrays, strings and records for observations, chunks, case packages, receipts, replies and stored commands. Imports are capped at 5 MB / 200 000 rows, 4 096 characters per CSV line and 32 per numeric field.
- **Store-and-forward:** SHA-256 content hash (integrity), idempotent receive, replies bound to the exact package event and revision, cross-run replies rejected, replies capped per package and per run. A reply is text for human review and can never trigger a device action.
- **Persistence:** commands are written before they are applied; rows recovered from IndexedDB or SQLite are schema-validated before replay.
- **Dependencies:** `pnpm audit` reports one low-severity advisory (deepmerge, via the build-time PWA plugin) with no published fix; overrides pin patched `image-size` and `glob`. No dependency with a known advisory ships in the application bundle.

## Independent review

An adversarial read-only review (web app, protocol, servers, supply chain) found no critical or high issue and confirmed four medium and six low findings. All were fixed with regression tests:

1. Quadratic regex in CSV number parsing → length caps and unambiguous pattern.
2. Unbounded ground package/rejection stores → caps, summary listing, ring buffer.
3. Unbounded ground replies → per-package and per-run caps, persisted cursor.
4. Reply not bound to its package's event/revision → strict binding (`mismatched-context`).
5. No-op commands growing the log, no rate limit → no-op detection, 30 requests/min per address.
6. Unbounded response read in the HTTP transport → streamed read with a 512 KB cap.
7. Stored commands replayed unvalidated → `CommandSchema` validation, invalid rows dropped and counted.
8. Any loopback origin trusted → allow-list limited to the ASTER web origins.
9. Sender-chosen origin label → stamped at the receiver, sender value kept as "claimed".
10. Serial parser CPU, idle WebSockets, token over plain HTTP → linear resync, idle timeout, start-up refusal.

## Residual risks (accepted and documented)

- **No TLS** in the local servers. A non-loopback deployment needs a TLS-terminating proxy.
- **Loopback mode is unauthenticated**: any local process can call the API. The "ground specialist" author role is self-asserted.
- **The content hash is integrity, not authentication.** Anyone who can reach the ground endpoint can submit a validly hashed package.
- **Browser and SQLite storage are unencrypted.** Acceptable only because the data are synthetic. Real health data would require a deployment threat model, access control and key management that this prototype does not provide.
- **The viewing role (crew / medical officer / researcher) is a UI preference**, not access control.
- `style-src 'unsafe-inline'` remains in the CSP for inline style attributes; there is no HTML sink that could exploit it.
- The HTTP rate limit is in-memory and per remote address; the ground server has none.
- Not reviewed: hosting configuration, Safari on macOS/iOS (only Playwright's WebKit build was run), and the operating environment.

## Reporting

This is a competition prototype without a security contact. Do not deploy it with real personal or health data.
