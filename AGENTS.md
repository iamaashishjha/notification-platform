# Project Instructions

## Repository Structure

This repository contains three major areas:

- `notification-admin-ui/`: frontend application
- `notification-core-api/`: backend application and APIs
- `docs/`: authoritative project documentation

## Source of Truth

Before implementing or modifying anything, inspect the relevant documentation
under `docs/`.

Documentation is linked and organized by domain. Follow existing links rather
than guessing file locations.

When code and documentation disagree:

1. Identify the conflict.
2. Do not silently choose one.
3. Determine whether the code or documentation is outdated.
4. Report the conflict before making a major behavioral change.
5. Update the affected documentation when the implementation changes.

## General Workflow

For every non-trivial task:

1. Understand the requirement.
2. Read relevant documentation.
3. Inspect existing frontend and backend implementations.
4. Identify impacted modules.
5. Produce a short implementation plan.
6. Implement the smallest correct change.
7. Run relevant tests and checks.
8. Review the resulting diff.
9. Update documentation when behavior, APIs, configuration, architecture,
   database structure, deployment, or operational processes change.

## Cross-Application Changes

For changes affecting both frontend and backend, verify:

- API request and response contracts
- Validation rules
- Authentication and authorization
- Error response handling
- Loading and empty states
- Backward compatibility
- Database changes
- Environment variables
- Documentation updates
- Automated tests

## Engineering Rules

- Follow existing project conventions before introducing new patterns.
- Do not create unnecessary abstractions.
- Do not duplicate existing utilities, services, components, or helpers.
- Preserve backward compatibility unless the requirement explicitly permits a
  breaking change.
- Never expose secrets, tokens, credentials, or private customer information.
- Do not modify generated files unless the project explicitly requires it.
- Do not claim a command or test passed unless it was actually executed.
- Clearly report checks that could not be run.

## Completion Criteria

A task is complete only when:

- The implementation satisfies the stated requirement.
- Relevant tests pass.
- Error and edge cases have been considered.
- Frontend and backend contracts remain aligned.
- Relevant documentation has been updated.
- The final diff contains no unrelated changes.