## ADDED Requirements

### Requirement: Weekly model health check
A scheduled job SHALL call every configured model once per week and alert the owner when any call returns 404 or 410.

#### Scenario: Model retired
- **WHEN** a configured model id returns 410
- **THEN** the owner is alerted with the model id before chat users are affected
