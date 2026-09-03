# Strikr — Combat Sports Link-in-Bio

Strikr is a dedicated link-in-bio web application built for combat sports athletes to present their fight records, physical specifications, walkout tracks, and career milestones in a clean, high-impact format.
**PLANS AS SHORT BULLET POINTS**

## Code Style & Formatting

### JavaScript (Node.js & Express)
- **Comments:** JSDoc for functions. **Brief but very informative.**
  - Inline and block comments are **one line, never more**. If the reasoning needs a paragraph it belongs in the JSDoc, in `migrations/`, or nowhere.
  - A JSDoc description is **one or two lines**, then the tags. Not paragraphs.
  - A comment earns its line by saying *why*. Never restate what the code already shows.
- **Indentation:** tabs.
- **Naming Conventions:**
  - `snake_case` for backend functions, parameters, database columns, and object keys (`update_simple_table`, `table_name`, `where_column`).
  - `SCREAMING_SNAKE_CASE` sparingly for important global constants.
- **Control Flow Spacing:** Standard spacing around keywords (`if(condition)`, `for(const item of list)` with no space before parentheses).
- **Curly Brace Spacing:** In function or in keyword declaration (`if(), else(), try, catch()`), do not put any spaces between parenthesis and curly braces. Break line before `if else` and `else` statements so they are not on the same line as curly braces.
- **String Literals:** Use double quotes `""` for regular strings/empty checks (`""`), template literals `` `${var}` `` for SQL/dynamic strings, and single quotes `''` sparingly.
- **Async & DB Patterns:**
  - Prefer modern `async/await` with `try/catch` or `.catch()` handlers on background Promises.
  - Parameterized PostgreSQL queries using `$1, $2` syntax. Use upper-case for SQL keywords (`SELECT`, `WHERE`, `UPDATE`, `SET`).
- **Data Coercion:** Explicit type casting using `Number()`, `parseInt(val, 10)`, or `Math.floor()`.

### HTML / EJS
- **Indentation:** tab.
- **Naming:** `kebab-case` for css classes
- **Attribute Styling:** Lowercase attribute names with double quotes (`class="profile-input"`, `type="text"`).
- **Custom Attributes:** Use `data-*` attributes for JS-driven field mapping (`data-group="..."`, `data-field="..."`, `data-index="..."`).
- **EJS Syntax:** Standard tag formatting (`<%= variable %>` with spaces inside delimiters).

### CSS
- **CSS Naming Policy:** Use kebab-case for all NEW CSS classes (`.profile-wrapper`, `.drop-area`). Do NOT bulk-rename legacy class names without explicit instructions to preserve JS DOM queries.
- **Indentation:** tab.
- **Naming Conventions:** `kebab-case` for classes (`.settings-wrapper`, `.profile-input`) and IDs (`#corner-radio`).
- **Custom Properties:** Use global CSS variables for recurring design tokens (`var(--red)`, `var(--blue)`, `var(--main-txt)`).
- **Formatting Rules:**
  - Standard CSS formatting with no space before opening braces `{`.
  - Prefer flexbox for layouts (`display: flex; flex-direction: row;`).
  - Use logical positioning shorthand where applicable (`inset: 0;`).

## Tech Stack
- **Backend:** Node.js, Express 5, PostgreSQL (`pg` Pool)
- **Frontend:** Vanilla HTML/CSS, modern JavaScript (native ES modules — no bundler)
- **Key Libraries:** FilePond (client-side image input), Cloudinary (image hosting), Nodemailer via Resend SMTP (email), express-session + connect-pg-simple (sessions in Postgres), express-rate-limit, multer (upload parsing), express-ejs-layouts
- **Not in use:** no password hashing (auth is passwordless), no error-reporting service yet (Sentry is a `//TODO:` in `libs/logger.js`), no test framework

## Authentication Model
Passwordless. There is no password column and nothing hashes or compares one.
- One email carries **both** a magic link and a 6-digit code — two ways to finish the *same* login, one `auth_tokens` row. The code exists for in-app browsers (Instagram/TikTok webviews open links in a different browser context).
- `auth_tokens.purpose` is one of `magic_link`, `profile_claim`, `account_deletion`.
- **The `users` row is created when a link is consumed, never when one is requested** — otherwise submitting addresses would mint rows.
- **Never add an endpoint that reveals whether an address is registered.** `/auth/request-link` answers identically either way, and delivery failures are logged, not reported.
- Claiming a placeholder is a deliberate two-token handoff: the claim token only proves the holder may answer the offer, and a separate magic link proves the address.

## Application Architecture & Structure
- **Core Entities & Features:**
  - **Fighter Record:** Tracked stats (`W / L / D / NC / KO / SUB`). `total_fights` is a generated column.
  - **Fighter Specs:** Stance, age, gym, hometown, nickname, corner team, and walkout track.
  - **Fighter Story:** Up to 4 custom milestone/chapter blocks (Title + Description), ordered by `awards.sort_order`.
- **Styling:** Modular CSS variables. Strict color usage (red/blue accents for fight-corner branding).

### Use the `libs/` helpers — do not re-roll them
- `libs/errors.js` — `AppError` plus `bad_request` / `unauthorized` / `forbidden` / `not_found` / `conflict` / `too_many_requests` / `server_error`. Each takes a `"json"` or `"html"` format. Throw these; never `res.status(...).json({error})` by hand.
- `libs/validation.js` — every input validator (`validate_email`, `validate_username`, `validate_uuid`, `validate_code`, `validate_text`, `validate_corner`, `validate_name`) and `MAX_TEXT_LENGTHS`.
- `libs/token.js` — every token and transactional-email flow. `libs/mailer.js` only exports `send_email`; routers import token helpers as `mailer` from `libs/requirements.js`.
- `libs/logger.js` — the only place that writes log lines.
- `pool.with_transaction(fn)` in `libs/db.js` — BEGIN/COMMIT/ROLLBACK wrapper.
- `libs/middleware/permissions.js` — `require_login(format)`, `require_admin`, `require_guest`, `require_onboarding`.
- `libs/middleware/rate_limits.js` — shared limiters. Any endpoint that sends email or accepts a guessable secret gets one.
- Everything is re-exported through `libs/requirements.js`; import from there.

### Onboarding gate
`require_onboarding` runs globally in `server.js`, before every router. An account created by a magic link has no username, corner, profile or record until onboarding finishes, so any new route is redirected to `/onboarding` unless its prefix is in `ONBOARDING_EXEMPT_PREFIXES`. **Check that list when adding a route that must work mid-onboarding.**

### Database & migrations
- `migrations/NNN_name.sql` is the source of truth. Additive and idempotent (`IF NOT EXISTS`, `DROP ... IF EXISTS`), with comments explaining *why* the change is needed. Applied by hand.
- `schema.sql` is a generated TSV column dump for reference — it is **not** runnable. Regenerate it after a migration.
- Never `ALTER` a table from application code.

### Front-end conventions
- Scripts in `public/js` are native ES modules, imported with absolute specifiers (`import { init_steps } from "/js/steps.js"`).
- `show_error(context, code, text, is_serverside, is_error)` is the global toast, defined in `global.js`. **Pass `false, false` for a success message** or it renders as a red HTTP error.
- Shared modules: `steps.js` (multi-step slider for onboarding/claim), `field_checks.js` (debounced username/email validation).
- The settings page serialises its form through `data-group` / `data-field` / `data-index` attributes and diffs against `initial_state`; keep that protocol when adding fields.

## Code Conventions & Standards
- **Vanilla JS & Modular CSS:** Avoid introducing heavy UI frameworks (React, Vue) unless explicitly requested.
- **Futur Implementation** If futur implementation, upscaling or reworking of code is needed, write a "//TODO:" comment with details specifying what is needed.
- **Error Handling:** Centralized frontend and backend error handlers. Throw an `AppError`; `libs/middleware/error_handler.js` is the single place that formats a response and decides what gets logged.
- **Validation:** Always validate and sanitize user inputs on Express API endpoints before database interaction. Client-side checks only save a round trip — they are never the enforcement.
- **Database Rules:** Use parametric queries (`pg` pool) for all PostgreSQL operations to prevent SQL injection.

### Security invariants (learned from audits — do not regress these)
- Allow-list column names before interpolating any identifier into SQL.
- Validate UUIDs before they reach a `uuid` column; Postgres raises a 500-level syntax error otherwise.
- Embedding data in a `<script>` block: `<%- JSON.stringify(value).replace(/</g, "\\u003c") %>`. Never interpolate a raw value into a JS string literal.
- Building DOM from athlete-controlled strings: assign `textContent`, never `innerHTML`.
- Delete Cloudinary media only *after* the transaction that removed its row commits.
- Destructive or session-changing actions regenerate the session (`req.session.regenerate`) and are rate limited.

## Commands
```bash
# Start development server
npm run dev

# Start production server
npm start

# Apply a migration (no runner — psql directly)
psql "$DATABASE_URL" -f migrations/00N_name.sql
```
There is no test suite. Verify changes by running the server and exercising the affected routes.
