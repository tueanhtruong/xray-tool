# Learn Harness Engineering: Index

## How to use this index

- Humans: scan the Quick lookup table, then open the chapter you need.
- AI agents: read this file first. Use **Read when** and **Keywords** to select the minimum set of chapters, then jump to the linked sections instead of loading whole chapters.

## Quick lookup

| #   | File                                                                                                                                         | Title                                                            | One-line intent                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 01  | [01-en.md](01-en.md)                                                                                                                         | Welcome to Learn Harness Engineering                             | Orient to the course and its closed-loop view of a harness.                 |
| 02  | [02-lecture-01-why-capable-agents-still-fail.md](02-lecture-01-why-capable-agents-still-fail.md)                                             | Lecture 01. Strong Models Don't Mean Reliable Execution          | Diagnose execution failures as harness failures rather than model failures. |
| 03  | [03-lecture-02-what-a-harness-actually-is.md](03-lecture-02-what-a-harness-actually-is.md)                                                   | Lecture 02. What a Harness Actually Is                           | Identify the five subsystems of a working harness.                          |
| 04  | [04-lecture-03-why-the-repository-must-become-the-system-of-record.md](04-lecture-03-why-the-repository-must-become-the-system-of-record.md) | Lecture 03. Making the Repository the Single Source of Truth     | Put agent-readable knowledge and state in the repository.                   |
| 05  | [05-lecture-04-why-one-giant-instruction-file-fails.md](05-lecture-04-why-one-giant-instruction-file-fails.md)                               | Lecture 04. Split Instructions Across Files                      | Keep the entry file small and route to topic documents.                     |
| 06  | [06-lecture-05-why-long-running-tasks-lose-continuity.md](06-lecture-05-why-long-running-tasks-lose-continuity.md)                           | Lecture 05. Keeping Context Alive Across Sessions                | Persist progress and decisions across context resets.                       |
| 07  | [07-lecture-06-why-initialization-needs-its-own-phase.md](07-lecture-06-why-initialization-needs-its-own-phase.md)                           | Lecture 06. Make the Agent Initialize Before Every Work Session  | Separate readiness and environment setup from implementation.               |
| 08  | [08-lecture-07-why-agents-overreach-and-under-finish.md](08-lecture-07-why-agents-overreach-and-under-finish.md)                             | Lecture 07. Draw Clear Task Boundaries for Agents                | Limit work in progress and require completion evidence.                     |
| 09  | [09-lecture-08-why-feature-lists-are-harness-primitives.md](09-lecture-08-why-feature-lists-are-harness-primitives.md)                       | Lecture 08. Use Feature Lists to Constrain What the Agent Does   | Make feature scope and verified state machine-readable.                     |
| 10  | [10-lecture-09-why-agents-declare-victory-too-early.md](10-lecture-09-why-agents-declare-victory-too-early.md)                               | Lecture 9. Preventing Agents from Declaring Victory Too Early    | Gate completion on external, layered checks.                                |
| 11  | [11-lecture-10-why-end-to-end-testing-changes-results.md](11-lecture-10-why-end-to-end-testing-changes-results.md)                           | Lecture 10. Only a Full Pipeline Run Counts as Real Verification | Catch boundary defects with end-to-end and architectural checks.            |
| 12  | [12-lecture-11-why-observability-belongs-inside-the-harness.md](12-lecture-11-why-observability-belongs-inside-the-harness.md)               | Lecture 11. Making the Agent's Runtime Observable                | Collect runtime signals and reproducible process evidence.                  |
| 13  | [13-lecture-12-why-every-session-must-leave-a-clean-state.md](13-lecture-12-why-every-session-must-leave-a-clean-state.md)                   | Lecture 12. Leave a Clean Handoff at the End of Every Session    | Make the next session start from verified, documented state.                |
| 14  | [14-lecture-13-loop-engineering.md](14-lecture-13-loop-engineering.md)                                                                       | Lecture 13. From Manual Prompting to Autonomous Loops            | Compose autonomous loops with independent evaluation and memory.            |
| 15  | [15-lecture-14-graph-engineering.md](15-lecture-14-graph-engineering.md)                                                                     | Lecture 14. From Single Loops to Graph Engineering               | Coordinate multiple loops through nodes, state and routing.                 |

## Suggested reading paths

- Full course: follow the Quick lookup table in order, from [welcome](01-en.md) through [graph engineering](15-lecture-14-graph-engineering.md).
- Agents stop early or claim done without proof: [task boundaries](08-lecture-07-why-agents-overreach-and-under-finish.md) -> [feature lists](09-lecture-08-why-feature-lists-are-harness-primitives.md) -> [termination checks](10-lecture-09-why-agents-declare-victory-too-early.md) -> [end-to-end verification](11-lecture-10-why-end-to-end-testing-changes-results.md).
- Build an agent-readable repository: [repository knowledge](04-lecture-03-why-the-repository-must-become-the-system-of-record.md) -> [instruction architecture](05-lecture-04-why-one-giant-instruction-file-fails.md) -> [session continuity](06-lecture-05-why-long-running-tasks-lose-continuity.md) -> [initialization](07-lecture-06-why-initialization-needs-its-own-phase.md).
- Run agents unattended: [five-subsystem harness](03-lecture-02-what-a-harness-actually-is.md) -> [observability](12-lecture-11-why-observability-belongs-inside-the-harness.md) -> [clean handoffs](13-lecture-12-why-every-session-must-leave-a-clean-state.md) -> [loops](14-lecture-13-loop-engineering.md) -> [graphs](15-lecture-14-graph-engineering.md).

## Chapter details

### Welcome to Learn Harness Engineering

- **File:** [01-en.md](01-en.md)
- **Intent:** Introduces the course and its study of reliable AI coding agents. Use it to choose between lectures, projects and resource templates.
- **Summary:** The course draws on OpenAI and Anthropic's harness engineering work. A harness does not make a model smarter; it creates a closed-loop working system around it. The overview identifies behavior constraints, cross-session context, prevention of premature completion, full-pipeline verification and runtime observability as learning goals. It also points to hands-on projects and frontier harness breakdowns.
- **Key sections:** [Get started](01-en.md#get-started); [The Core Mechanism of a Harness](01-en.md#the-core-mechanism-of-a-harness); [What you will learn](01-en.md#what-you-will-learn).
- **Prerequisites:** None.
- **Read when:** Starting the course or locating its lectures, projects and templates.
- **Keywords:** harness, closed-loop, context, verification, runtime, agents.
- **Related:** [Lecture 01](02-lecture-01-why-capable-agents-still-fail.md) explains the reliability problem; [Lecture 02](03-lecture-02-what-a-harness-actually-is.md) names the harness subsystems.

### Lecture 01: Strong Models Don't Mean Reliable Execution

- **File:** [02-lecture-01-why-capable-agents-still-fail.md](02-lecture-01-why-capable-agents-still-fail.md)
- **Intent:** Distinguishes model capability from reliable task execution. Use its failure categories to diagnose the harness layer that needs work.
- **Summary:** The same model can produce very different results under different execution conditions. Agents get stuck when requirements, conventions, environment, verification or retained state are inadequate. The lecture defines the capability gap, harness-induced failure and verification gap. Its examples pair explicit completion criteria and diagnostic iterations with more reliable outcomes.
- **Key sections:** [Same Horse, Different Fates](02-lecture-01-why-capable-agents-still-fail.md#same-horse-different-fates); [Where Agents Actually Get Stuck](02-lecture-01-why-capable-agents-still-fail.md#where-agents-actually-get-stuck); [When Things Fail, Fix the Harness First](02-lecture-01-why-capable-agents-still-fail.md#when-things-fail-fix-the-harness-first).
- **Prerequisites:** [Welcome](01-en.md) for course orientation.
- **Read when:** A capable model repeatedly fails real tasks, or you need to define what done means.
- **Keywords:** capability gap, harness-induced failure, verification gap, definition of done, diagnostic loop, AGENTS.md.
- **Related:** [Lecture 02](03-lecture-02-what-a-harness-actually-is.md) inventories the layers to improve; [Lecture 9](10-lecture-09-why-agents-declare-victory-too-early.md) expands completion checks.

### Lecture 02: What a Harness Actually Is

- **File:** [03-lecture-02-what-a-harness-actually-is.md](03-lecture-02-what-a-harness-actually-is.md)
- **Intent:** Defines a harness as more than a prompt or instruction file. Use its subsystem model to audit which parts of an agent workflow are missing.
- **Summary:** The harness combines instructions, tools, environment, state and feedback. Each subsystem gives the agent a different part of the support it needs to execute and verify work. A team example adds these parts incrementally without changing models. The lecture also proposes a controlled-variable exclusion test to measure what each subsystem contributes.
- **Key sections:** [Core Concepts](03-lecture-02-what-a-harness-actually-is.md#core-concepts); [The Five-Subsystem Harness Model](03-lecture-02-what-a-harness-actually-is.md#the-five-subsystem-harness-model); [A Team's Real Story](03-lecture-02-what-a-harness-actually-is.md#a-teams-real-story).
- **Prerequisites:** [Lecture 01](02-lecture-01-why-capable-agents-still-fail.md) for the execution-reliability problem.
- **Read when:** Designing a first harness or comparing the value of instructions, tools, state and feedback.
- **Keywords:** instructions, tools, environment, state, feedback, harness debt, controlled variable.
- **Related:** [Lecture 03](04-lecture-03-why-the-repository-must-become-the-system-of-record.md) organizes the knowledge and state; [Lecture 04](05-lecture-04-why-one-giant-instruction-file-fails.md) organizes instructions.

### Lecture 03: Making the Repository the Single Source of Truth

- **File:** [04-lecture-03-why-the-repository-must-become-the-system-of-record.md](04-lecture-03-why-the-repository-must-become-the-system-of-record.md)
- **Intent:** Makes project knowledge discoverable to agents in the repository itself. Use its mapping and fresh-session ideas to remove dependence on unwritten context.
- **Summary:** An agent can use prompts, repository files and tool output, not knowledge stranded in people's heads or other systems. The lecture places architecture, constraints, verification and progress where fresh sessions can find them. It tests that visibility with a fresh-session exercise and discusses managing agent state with ACID principles. The aim is a repository that explains both how to work and where work currently stands.
- **Key sections:** [What Belongs on the Map](04-lecture-03-why-the-repository-must-become-the-system-of-record.md#what-belongs-on-the-map); [Knowledge Visibility](04-lecture-03-why-the-repository-must-become-the-system-of-record.md#knowledge-visibility); [Managing Agent State with ACID Principles](04-lecture-03-why-the-repository-must-become-the-system-of-record.md#managing-agent-state-with-acid-principles).
- **Prerequisites:** [Lecture 02](03-lecture-02-what-a-harness-actually-is.md) for the harness subsystems.
- **Read when:** Agents must repeatedly rediscover decisions or cannot find authoritative project rules.
- **Keywords:** repository, system of record, knowledge visibility, fresh session, AGENTS.md, ACID.
- **Related:** [Lecture 04](05-lecture-04-why-one-giant-instruction-file-fails.md) structures repository instructions; [Lecture 05](06-lecture-05-why-long-running-tasks-lose-continuity.md) persists progress.

### Lecture 04: Split Instructions Across Files

- **File:** [05-lecture-04-why-one-giant-instruction-file-fails.md](05-lecture-04-why-one-giant-instruction-file-fails.md)
- **Intent:** Prevents growing instruction files from burying important constraints. Use a short entry file to route agents to focused topic documents.
- **Summary:** Adding a rule after every failure can turn a single instruction file into a noisy, expensive context load. The lecture explains signal-to-noise and the lost-in-the-middle problem. It proposes an entry file containing essentials and links to topic-specific guidance that is read when relevant. A worked instruction architecture and a real-world restructuring show how to split the material.
- **Key sections:** [The Vicious Cycle at the Root](05-lecture-04-why-one-giant-instruction-file-fails.md#the-vicious-cycle-at-the-root); [Instruction Architecture](05-lecture-04-why-one-giant-instruction-file-fails.md#instruction-architecture); [How to Split](05-lecture-04-why-one-giant-instruction-file-fails.md#how-to-split).
- **Prerequisites:** [Lecture 03](04-lecture-03-why-the-repository-must-become-the-system-of-record.md) for the repository as knowledge home.
- **Read when:** AGENTS.md is hard to scan, consumes too much context or hides critical rules.
- **Keywords:** instruction bloat, lost in the middle, entry file, topic docs, signal-to-noise, constraints.
- **Related:** [Lecture 03](04-lecture-03-why-the-repository-must-become-the-system-of-record.md) establishes the knowledge home; [Lecture 06](07-lecture-06-why-initialization-needs-its-own-phase.md) uses instructions during startup.

### Lecture 05: Keeping Context Alive Across Sessions

- **File:** [06-lecture-05-why-long-running-tasks-lose-continuity.md](06-lecture-05-why-long-running-tasks-lose-continuity.md)
- **Intent:** Prevents work and design rationale from disappearing at context or session boundaries. Use progress, decisions and checkpoints to make the next session productive.
- **Summary:** Finite context windows force long tasks to span sessions. Without durable state, agents waste time rediscovering work and may diverge from earlier decisions. Progress files, decision logs, Git checkpoints and startup/exit routines reduce rebuild cost. The lecture also discusses context anxiety and why rushing near a context limit can weaken verification.
- **Key sections:** [Context Windows: Not Infinite](06-lecture-05-why-long-running-tasks-lose-continuity.md#context-windows-not-infinite); [Practical Approaches to State Persistence](06-lecture-05-why-long-running-tasks-lose-continuity.md#practical-approaches-to-state-persistence); [A Deeper Look at Context Anxiety](06-lecture-05-why-long-running-tasks-lose-continuity.md#a-deeper-look-at-context-anxiety).
- **Prerequisites:** [Lecture 03](04-lecture-03-why-the-repository-must-become-the-system-of-record.md) for repository-backed state.
- **Read when:** Sessions restart from scratch, lose decisions or rush to finish as context runs out.
- **Keywords:** context window, progress, state persistence, decision logs, rebuild cost, context anxiety.
- **Related:** [Lecture 06](07-lecture-06-why-initialization-needs-its-own-phase.md) defines the startup phase; [Lecture 12](13-lecture-12-why-every-session-must-leave-a-clean-state.md) defines the exit handoff.

### Lecture 06: Make the Agent Initialize Before Every Work Session

- **File:** [07-lecture-06-why-initialization-needs-its-own-phase.md](07-lecture-06-why-initialization-needs-its-own-phase.md)
- **Intent:** Separates project readiness from feature implementation. Use a dedicated initialization phase and readiness checks before the agent begins feature work.
- **Summary:** Environment setup and implementation have different goals, and mixing them leaves infrastructure half-built. Initialization establishes a runnable environment, working tests, progress visibility and an ordered next-task list. The lecture supplies a startup readiness checklist and contrasts a template-based start with starting from scratch. Implementation begins only after the setup is verifiable.
- **Key sections:** [Two Fundamentally Different Kinds of Work](07-lecture-06-why-initialization-needs-its-own-phase.md#two-fundamentally-different-kinds-of-work); [Initialization Lifecycle](07-lecture-06-why-initialization-needs-its-own-phase.md#initialization-lifecycle); [How to Do Initialization Right](07-lecture-06-why-initialization-needs-its-own-phase.md#how-to-do-initialization-right).
- **Prerequisites:** [Lecture 05](06-lecture-05-why-long-running-tasks-lose-continuity.md) for continuity across sessions.
- **Read when:** Starting a multi-session project or debugging a session that cannot run or test the project.
- **Keywords:** initialization, environment, startup readiness, test framework, task breakdown, template.
- **Related:** [Lecture 07](08-lecture-07-why-agents-overreach-and-under-finish.md) constrains implementation after startup; [Lecture 12](13-lecture-12-why-every-session-must-leave-a-clean-state.md) makes future startups possible.

### Lecture 07: Draw Clear Task Boundaries for Agents

- **File:** [08-lecture-07-why-agents-overreach-and-under-finish.md](08-lecture-07-why-agents-overreach-and-under-finish.md)
- **Intent:** Stops agents from opening too much work and finishing too little. Use a one-task work-in-progress limit with explicit evidence of completion.
- **Summary:** Agent attention is finite, so simultaneous tasks can consume effort without producing finished features. Overreach and under-finish reinforce each other. The chapter makes WIP=1 the default, externalizes scope and defines observable completion criteria per task. It also introduces verified completion rate as a way to assess actual progress.
- **Key sections:** [WIP=1 Workflow](08-lecture-07-why-agents-overreach-and-under-finish.md#wip1-workflow); [Overreach and Under-finish Are Two Sides of the Same Coin](08-lecture-07-why-agents-overreach-and-under-finish.md#overreach-and-under-finish-are-two-sides-of-the-same-coin); [How to Do It Right](08-lecture-07-why-agents-overreach-and-under-finish.md#how-to-do-it-right).
- **Prerequisites:** [Lecture 06](07-lecture-06-why-initialization-needs-its-own-phase.md) for a ready environment and task plan.
- **Read when:** Agents expand scope, leave features half-done or produce lots of code without verified progress.
- **Keywords:** WIP=1, overreach, under-finish, scope surface, completion evidence, verified completion rate.
- **Related:** [Lecture 08](09-lecture-08-why-feature-lists-are-harness-primitives.md) records bounded tasks; [Lecture 9](10-lecture-09-why-agents-declare-victory-too-early.md) checks completion claims.

### Lecture 08: Use Feature Lists to Constrain What the Agent Does

- **File:** [09-lecture-08-why-feature-lists-are-harness-primitives.md](09-lecture-08-why-feature-lists-are-harness-primitives.md)
- **Intent:** Makes scope and completion state explicit rather than leaving them to agent memory. Use feature records as input to scheduling, verification and handoffs.
- **Summary:** Agents can disagree about what done means when feature descriptions lack testable behavior. The chapter gives each feature a behavior description, verification command and current state. A state machine and pass-state gating prevent unverified features from being marked complete. Structured lists also help new sessions pick up work without reconstructing scope from notes.
- **Key sections:** [Feature State Machine](09-lecture-08-why-feature-lists-are-harness-primitives.md#feature-state-machine); [Why Feature Lists Must Be "Primitives"](09-lecture-08-why-feature-lists-are-harness-primitives.md#why-feature-lists-must-be-primitives); [How to Do It](09-lecture-08-why-feature-lists-are-harness-primitives.md#how-to-do-it).
- **Prerequisites:** [Lecture 07](08-lecture-07-why-agents-overreach-and-under-finish.md) for task boundaries and completion evidence.
- **Read when:** Tracking a multi-feature project or preventing agents from choosing and closing tasks arbitrarily.
- **Keywords:** feature list, state machine, verification command, pass-state gating, scope, CLAUDE.md.
- **Related:** [Lecture 9](10-lecture-09-why-agents-declare-victory-too-early.md) applies termination gates; [Lecture 12](13-lecture-12-why-every-session-must-leave-a-clean-state.md) updates progress at handoff.

### Lecture 9: Preventing Agents from Declaring Victory Too Early

- **File:** [10-lecture-09-why-agents-declare-victory-too-early.md](10-lecture-09-why-agents-declare-victory-too-early.md)
- **Intent:** Replaces an agent's confidence in its own work with external completion checks. Use layered verification before accepting a done claim.
- **Summary:** Passing unit tests or seeing plausible code does not prove a task is complete. The chapter identifies self-evaluation bias and a verification-validation gap. Its three-layer termination check moves from static checks through runtime behavior to system-level confirmation. Independent evaluators and actionable runtime feedback reduce premature completion and unverified refactoring.
- **Key sections:** [Three-Layer Termination Check](10-lecture-09-why-agents-declare-victory-too-early.md#three-layer-termination-check); [Passing Unit Tests ≠ Task Complete](10-lecture-09-why-agents-declare-victory-too-early.md#passing-unit-tests--task-complete); [How to Prevent Premature Completion Declarations](10-lecture-09-why-agents-declare-victory-too-early.md#how-to-prevent-premature-completion-declarations).
- **Prerequisites:** [Lecture 08](09-lecture-08-why-feature-lists-are-harness-primitives.md) for verifiable feature states.
- **Read when:** Agents claim success before running the application or verifying an integrated workflow.
- **Keywords:** termination, unit tests, runtime, calibration, validation, evaluator, feedback.
- **Related:** [Lecture 10](11-lecture-10-why-end-to-end-testing-changes-results.md) expands system checks; [Lecture 11](12-lecture-11-why-observability-belongs-inside-the-harness.md) makes failures visible.

### Lecture 10: Only a Full Pipeline Run Counts as Real Verification

- **File:** [11-lecture-10-why-end-to-end-testing-changes-results.md](11-lecture-10-why-end-to-end-testing-changes-results.md)
- **Intent:** Finds failures hidden by isolated unit tests. Use end-to-end tests and executable architecture rules to verify complete workflows.
- **Summary:** Unit tests intentionally isolate components and miss interface, state, resource and environment problems at their boundaries. End-to-end tests exercise the full pipeline and change what agents attend to during implementation. The chapter also turns architecture and review feedback into executable checks with repair-oriented errors. A worked case contrasts isolated success with defects discovered by a full run.
- **Key sections:** [The Blind Spots of Unit Tests](11-lecture-10-why-end-to-end-testing-changes-results.md#the-blind-spots-of-unit-tests); [Testing Pyramid and Review Feedback Promotion](11-lecture-10-why-end-to-end-testing-changes-results.md#testing-pyramid-and-review-feedback-promotion); [How to Do It](11-lecture-10-why-end-to-end-testing-changes-results.md#how-to-do-it).
- **Prerequisites:** [Lecture 9](10-lecture-09-why-agents-declare-victory-too-early.md) for the termination check's system layer.
- **Read when:** Unit tests pass but integrated user workflows or architecture constraints fail.
- **Keywords:** end-to-end, testing pyramid, component boundary, architecture, executable checks, feedback.
- **Related:** [Lecture 11](12-lecture-11-why-observability-belongs-inside-the-harness.md) helps diagnose pipeline failures; [Lecture 12](13-lecture-12-why-every-session-must-leave-a-clean-state.md) requires tests at handoff.

### Lecture 11: Making the Agent's Runtime Observable

- **File:** [12-lecture-11-why-observability-belongs-inside-the-harness.md](12-lecture-11-why-observability-belongs-inside-the-harness.md)
- **Intent:** Exposes both what the running system did and why the agent made its decisions. Use signals and evaluation artifacts to make failures actionable.
- **Summary:** Without observability, agents retry blindly and new sessions repeat diagnosis. Runtime signals such as logs and traces show execution, while process artifacts show scope and evaluation criteria. The chapter describes signal collection, sprint contracts, evaluator rubrics and OpenTelemetry. Its three-agent experiment illustrates how planner, builder and evaluator roles make results more inspectable.
- **Key sections:** [Layered Observability](12-lecture-11-why-observability-belongs-inside-the-harness.md#layered-observability); [How to Build Observability](12-lecture-11-why-observability-belongs-inside-the-harness.md#how-to-build-observability); [Anthropic's Three-Agent Architecture Experiment](12-lecture-11-why-observability-belongs-inside-the-harness.md#anthropics-three-agent-architecture-experiment).
- **Prerequisites:** [Lecture 9](10-lecture-09-why-agents-declare-victory-too-early.md) for evidence-based checks.
- **Read when:** Failures are opaque, evaluations are subjective or session startup repeats expensive investigation.
- **Keywords:** observability, runtime signals, process observability, sprint contract, evaluator rubric, OpenTelemetry.
- **Related:** [Lecture 10](11-lecture-10-why-end-to-end-testing-changes-results.md) creates pipeline evidence; [Lecture 13](14-lecture-13-loop-engineering.md) needs feedback in unattended runs.

### Lecture 12: Leave a Clean Handoff at the End of Every Session

- **File:** [13-lecture-12-why-every-session-must-leave-a-clean-state.md](13-lecture-12-why-every-session-must-leave-a-clean-state.md)
- **Intent:** Makes each session leave a verified starting point for the next. Use an exit routine that covers code, tests, progress, artifacts and startup.
- **Summary:** Repeated agent work increases repository entropy if the harness copies stale patterns or postpones cleanup. Clean state means more than a compiling tree: build and tests pass, progress is updated, temporary artifacts are removed and the next session can start. The chapter describes cleanup loops, a quality document, harness simplification and idempotent cleanup. Its case contrasts disciplined handoffs with accumulating maintenance cost.
- **Key sections:** [Clean State: More Than "The Code Compiles"](13-lecture-12-why-every-session-must-leave-a-clean-state.md#clean-state-more-than-the-code-compiles); [How to Do It](13-lecture-12-why-every-session-must-leave-a-clean-state.md#how-to-do-it); [Real-World Case](13-lecture-12-why-every-session-must-leave-a-clean-state.md#real-world-case).
- **Prerequisites:** [Lecture 05](06-lecture-05-why-long-running-tasks-lose-continuity.md) for durable session state; [Lecture 08](09-lecture-08-why-feature-lists-are-harness-primitives.md) for progress tracking.
- **Read when:** Every new session inherits broken tests, stale progress or unexplained temporary changes.
- **Keywords:** clean state, handoff, entropy, quality document, cleanup loop, idempotent, progress.
- **Related:** [Lecture 06](07-lecture-06-why-initialization-needs-its-own-phase.md) describes the receiving startup; [Lecture 13](14-lecture-13-loop-engineering.md) depends on repeatable runs.

### Lecture 13: From Manual Prompting to Autonomous Loops

- **File:** [14-lecture-13-loop-engineering.md](14-lecture-13-loop-engineering.md)
- **Intent:** Turns repeated human prompting into a bounded, observable execution loop. Use separate generator and evaluator roles, memory and a stopping condition before running unattended.
- **Summary:** A `/goal` combines an objective, verification and a stopping rule; different loop types then trigger work by turn, time, goal or event. The chapter assembles automations, worktrees, skills, connectors, sub-agents and external state into a working loop. It uses autoresearch to show a ratchet that tests changes, keeps improvements and rejects regressions. It also details verification debt, comprehension rot, cognitive surrender and token blowout as costs of unchecked autonomy.
- **Key sections:** [The Six Primitives of a Loop](14-lecture-13-loop-engineering.md#the-six-primitives-of-a-loop); [Generator/Evaluator Separation: Why You Can't Let the Model Grade Its Own Work](14-lecture-13-loop-engineering.md#generatorevaluator-separation-why-you-cant-let-the-model-grade-its-own-work); [Building Your First Loop](14-lecture-13-loop-engineering.md#building-your-first-loop); [Four Silent Costs](14-lecture-13-loop-engineering.md#four-silent-costs).
- **Prerequisites:** [Lecture 9](10-lecture-09-why-agents-declare-victory-too-early.md) for independent verification; [Lecture 12](13-lecture-12-why-every-session-must-leave-a-clean-state.md) for repeatable handoffs.
- **Read when:** Automating a recurring task, running agents unattended or evaluating whether a loop is actually safe to repeat.
- **Keywords:** /goal, /loop, automations, worktrees, skills, sub-agents, external state, verification debt.
- **Related:** [Lecture 14](15-lecture-14-graph-engineering.md) connects multiple loops; [Lecture 11](12-lecture-11-why-observability-belongs-inside-the-harness.md) supplies runtime evidence.

### Lecture 14: From Single Loops to Graph Engineering

- **File:** [15-lecture-14-graph-engineering.md](15-lecture-14-graph-engineering.md)
- **Intent:** Coordinates specialized agent loops when one loop cannot manage branching, rollback or concurrent work. Use graph structure only when its coordination benefit outweighs its cost.
- **Summary:** Prompt, context, loop and graph form a stack rather than replacing one another. Nodes perform work, edges hand off, shared state carries results and routing rules choose the next step. The chapter examines Goodhart-style metric failures, upward blindness and conflict between loops. It contrasts agent graphs with fixed workflows, walks through constructing a graph and warns about the orchestration tax.
- **Key sections:** [Take the Graph Apart: Nodes, Edges, State, Routing](15-lecture-14-graph-engineering.md#take-the-graph-apart-nodes-edges-state-routing); [Three Structural Failures of a Single Loop at Scale](15-lecture-14-graph-engineering.md#three-structural-failures-of-a-single-loop-at-scale); [Build Your First Graph from Scratch](15-lecture-14-graph-engineering.md#build-your-first-graph-from-scratch); [When You Actually Need a Graph](15-lecture-14-graph-engineering.md#when-you-actually-need-a-graph).
- **Prerequisites:** [Lecture 13](14-lecture-13-loop-engineering.md) for loops as graph nodes; [Lecture 11](12-lecture-11-why-observability-belongs-inside-the-harness.md) for visible evaluation.
- **Read when:** Multiple specialized agents need dynamic handoffs, checkpoints, branching or rollback.
- **Keywords:** graph, nodes, edges, shared state, routing, Goodhart, anchors, orchestration tax.
- **Related:** [Lecture 13](14-lecture-13-loop-engineering.md) provides the loop inside a node; [Lecture 08](09-lecture-08-why-feature-lists-are-harness-primitives.md) provides task state to route.

## Concept-to-chapter map

| Concept / question                          | Go to                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where do I start?                           | [Welcome: Get started](01-en.md#get-started)                                                                                                                            |
| Why does a strong model still fail?         | [Lecture 01: Where Agents Actually Get Stuck](02-lecture-01-why-capable-agents-still-fail.md#where-agents-actually-get-stuck)                                           |
| What belongs in a harness?                  | [Lecture 02: The Five-Subsystem Harness Model](03-lecture-02-what-a-harness-actually-is.md#the-five-subsystem-harness-model)                                            |
| Where should project knowledge live?        | [Lecture 03: What Belongs on the Map](04-lecture-03-why-the-repository-must-become-the-system-of-record.md#what-belongs-on-the-map)                                     |
| How do I manage agent state with ACID?      | [Lecture 03: Managing Agent State with ACID Principles](04-lecture-03-why-the-repository-must-become-the-system-of-record.md#managing-agent-state-with-acid-principles) |
| How should I split AGENTS.md?               | [Lecture 04: How to Split](05-lecture-04-why-one-giant-instruction-file-fails.md#how-to-split)                                                                          |
| How do sessions retain context?             | [Lecture 05: Practical Approaches to State Persistence](06-lecture-05-why-long-running-tasks-lose-continuity.md#practical-approaches-to-state-persistence)              |
| What should initialization check?           | [Lecture 06: How to Do Initialization Right](07-lecture-06-why-initialization-needs-its-own-phase.md#how-to-do-initialization-right)                                    |
| How do I stop task sprawl?                  | [Lecture 07: WIP=1 Workflow](08-lecture-07-why-agents-overreach-and-under-finish.md#wip1-workflow)                                                                      |
| How do features move to passing?            | [Lecture 08: Feature State Machine](09-lecture-08-why-feature-lists-are-harness-primitives.md#feature-state-machine)                                                    |
| How do I prevent premature done claims?     | [Lecture 9: Three-Layer Termination Check](10-lecture-09-why-agents-declare-victory-too-early.md#three-layer-termination-check)                                         |
| What do unit tests miss?                    | [Lecture 10: The Blind Spots of Unit Tests](11-lecture-10-why-end-to-end-testing-changes-results.md#the-blind-spots-of-unit-tests)                                      |
| How do I add end-to-end checks?             | [Lecture 10: How to Do It](11-lecture-10-why-end-to-end-testing-changes-results.md#how-to-do-it)                                                                        |
| How do I observe an agent runtime?          | [Lecture 11: How to Build Observability](12-lecture-11-why-observability-belongs-inside-the-harness.md#how-to-build-observability)                                      |
| What makes a session handoff clean?         | [Lecture 12: Clean State](13-lecture-12-why-every-session-must-leave-a-clean-state.md#clean-state-more-than-the-code-compiles)                                          |
| How do I make a repeatable autonomous loop? | [Lecture 13: Building Your First Loop](14-lecture-13-loop-engineering.md#building-your-first-loop)                                                                      |
| Why separate maker and checker?             | [Lecture 13: Generator/Evaluator Separation](14-lecture-13-loop-engineering.md#generatorevaluator-separation-why-you-cant-let-the-model-grade-its-own-work)             |
| When should I use a graph?                  | [Lecture 14: When You Actually Need a Graph](15-lecture-14-graph-engineering.md#when-you-actually-need-a-graph)                                                         |
| How do nodes, edges and routing work?       | [Lecture 14: Take the Graph Apart](15-lecture-14-graph-engineering.md#take-the-graph-apart-nodes-edges-state-routing)                                                   |
