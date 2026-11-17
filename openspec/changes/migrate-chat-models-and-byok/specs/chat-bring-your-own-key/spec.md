## ADDED Requirements

### Requirement: Login is the main way to bring a key
Chat SHALL offer "Log in with OpenRouter" as the primary way to use a person's own account, without the person seeing or pasting a key.

#### Scenario: Person logs in
- **WHEN** a person approves the OpenRouter login
- **THEN** their requests use their account and cost us nothing

### Requirement: Pasted keys are an advanced option
Pasting an Anthropic or OpenAI key SHALL remain available under an advanced option.

#### Scenario: Person pastes an Anthropic key
- **WHEN** a person pastes a valid Anthropic key
- **THEN** their requests use it and are billed to them

### Requirement: Own-Vercel only if billing works
Chat SHALL offer "their own Vercel key" only after it is verified that the person's own Vercel account is billed.

#### Scenario: Not verified
- **WHEN** Vercel sign-in cannot bill the person's account
- **THEN** no Vercel bring-your-own-key option is shown

### Requirement: Keys stay with the person
A person's own key SHALL stay in their browser and SHALL only be stored on our server, encrypted, when the person opts in to PR reviews. Keys SHALL NOT be written to logs.

#### Scenario: Person does not opt in
- **WHEN** a person saves a key and does not tick the PR reviews option
- **THEN** the key is not stored on our server
