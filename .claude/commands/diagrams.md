# Architecture & Diagramming Rules

## Purpose

This repository must be documented with **clear, high-level architecture diagrams** that explain:

* System structure
* Major components and boundaries
* Data flow and integrations
* Deployment topology

All diagrams must be **versionable, readable, and kept up to date**.

---

## When This Applies

**Follow these rules whenever the user asks about:**

* architecture
* system design
* diagrams
* components
* services
* infrastructure
* deployment
* data flow

---

## Mandatory Workflow

### 1. Inspect the Codebase First

Before drawing anything:

* Scan the repository structure
* Identify:

  * Entrypoints (`main`, `server`, `app`, handlers, workers, jobs)
  * Major modules and services
  * Databases, queues, caches
  * External dependencies and APIs
  * Deployment hints (Docker, serverless, k8s, etc)

---

### 2. Identify Major Components

Explicitly list:

* Frontend(s)
* Backend service(s)
* Datastores
* Async systems (queues, cron, workers)
* External integrations

Also infer:

* Monolith vs microservices
* Serverless vs containerized vs VM-based

---

### 3. Choose the Right Diagram Types

Propose **one or more** of:

* C4 Context / Container diagrams
* Component diagrams
* Sequence diagrams (for key flows)
* Deployment diagrams
* Data-flow diagrams

Explain briefly **why** each is useful.

---

### 4. Generate Diagrams as Code

Always use **text-based, versionable formats**:

* **Mermaid** (preferred)
* PlantUML
* draw.io XML (diagrams.net) if needed

Diagrams must:

* Use stable, greppable IDs (`auth-service`, `orders-api`, `postgres-db`)
* Group components into clear boundaries (`Frontend`, `Backend`, `Data`, `3rd-party`)
* Show:

  * Direction of data flow
  * Protocols (HTTP, gRPC, SQL, MQ, etc)
  * Trust boundaries where relevant

---

### 5. ALWAYS Update `/docs/DIAGRAMS.md` (Mandatory)

**Whenever you generate or modify a diagram:**

* You MUST:

  * Create or update `/docs/DIAGRAMS.md`
  * Insert the generated diagram(s) into that file
  * Organize them under clear section headers (e.g. `## System Context`, `## Backend Components`, etc)

* Each diagram section in `/docs/DIAGRAMS.md` MUST include:

  * The diagram (Mermaid / PlantUML / etc)
  * A **Legend**
  * An **Assumptions** section

Example structure:

````md
## System Context

```mermaid
...
````

### Legend

* ...

### Assumptions

* ...

```

---

### 6. Keep Diagrams Small and Iterative

- Prefer **multiple small diagrams** over one giant one
- Split by:
  - Context
  - Container
  - Subsystem
  - Critical flows
- After generating diagrams:
  - Propose questions
  - Suggest refinements or alternatives

---

## Diagram Conventions

- Use stable, greppable IDs
- Always show:
  - Data flow direction
  - Integration type
  - Boundaries
- Avoid visual clutter
- Optimize for **readability, not exhaustiveness**

---

## Success Criteria

A good result means:

- A new or updated `/docs/DIAGRAMS.md` exists
- Diagrams can be reviewed in PRs
- A new engineer can understand the system in 5–10 minutes by reading them

---
