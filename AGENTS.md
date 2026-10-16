# Project Persistent Rules & Architecture

## Database Architecture
- **Primary Database**: PostgreSQL (`pg` pool, Drizzle ORM, raw SQL execution, REST API `/api/*` endpoints).
- **Rule**: ALWAYS use PostgreSQL for all backend data storage, schema migrations, persistence, transactions, and queries.
- **Strict Restriction**: NEVER use Firebase, Firestore, Firebase Realtime Database, or Firebase Authentication. All data operations and authentication are handled via PostgreSQL and custom REST/API handlers.
