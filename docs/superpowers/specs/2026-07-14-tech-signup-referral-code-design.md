# Tech signup referral-code entry

## Scope

Add an optional referral-code entry affordance to the frontend tech-account signup experience only. This work does not modify API payloads, backend validation, database schema, or referral persistence.

## Experience

When a visitor creates an account and selects **Tech**, show a compact button labeled **Have a referral code?**. Selecting it reveals an optional referral-code text field. Selecting Customer, switching to Log in, or leaving the field blank keeps the normal signup flow unchanged.

The feature belongs in both existing tech-registration surfaces:

- The shared account-creation modal after Tech is selected.
- The dedicated For Techs signup modal.

The field is local UI state only. The existing registration request remains unchanged, so entering a code never blocks account creation or creates a referral record.

## Error handling and accessibility

The revealed field has a visible label and remains keyboard reachable. It is optional and has no frontend validation because referral validation and application will be implemented later in the backend flow. Existing registration errors retain their current display behavior.

## Testing

Add focused component tests that assert the referral-code question is available on tech registration, reveals its input on activation, and is absent from customer and login states. Confirm the existing registration payload remains unaffected.
