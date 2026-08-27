# Strikr — Combat Sports Link-in-Bio

Strikr is a dedicated link-in-bio web application built for combat sports athletes to present their fight records, physical specifications, walkout tracks, and career milestones in a clean, high-impact format.

## Code Style & Formatting

### JavaScript (Node.js & Express)
- **Comments:** JSDoc
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
- **Backend:** Node.js, Express, PostgreSQL (See schema.sql for a dummy DB achitecture of my DB)
- **Frontend:** Vanilla HTML/CSS, Modern JavaScript
- **Key Libraries:** FilePond (image processing/uploads), Pool (PostgreSQL Database), Bcrypt (Password Encryption), Cloudinary (Cloud Img Upload), Sentry (Error Handling)

## Application Architecture & Structure
- **Core Entities & Features:**
  - **Fighter Record:** Tracked stats (`W / L / D / NC / KO / SUB`).
  - **Fighter Specs:** Stance, age, gym, hometown, nickname, corner team, and walkout track.
  - **Fighter Story:** Up to 4 custom milestone/chapter blocks (Title + Description).
- **Styling:** Modular CSS variables. Strict color usage (red/blue accents for fight-corner branding).

## Code Conventions & Standards
- **Vanilla JS & Modular CSS:** Avoid introducing heavy UI frameworks (React, Vue) unless explicitly requested.
- **Error Handling:** Centralized frontend and backend error handlers. Wrap unexpected server-side exceptions with Sentry integration.
- **Validation:** Always validate and sanitize user inputs on Express API endpoints before database interaction.
- **Database Rules:** Use parametric queries (`pg` pool) for all PostgreSQL operations to prevent SQL injection.

## Commands
```bash
# Start development server
npm run dev

# Start production server
npm start