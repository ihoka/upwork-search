# Authentication and scopes

## OAuth2 flow

Standard OAuth2 authorization code flow:

1. Direct the user to `https://www.upwork.com/ab/account-security/oauth2/authorize?response_type=code&client_id=…&redirect_uri=…`
2. Exchange the `code` at `https://www.upwork.com/api/v3/oauth2/token` (POST, `application/x-www-form-urlencoded`) with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret`.
3. Receive `access_token`, `refresh_token`, `expires_in` (seconds).
4. Refresh using the same endpoint with `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`.

API Center (keys, scopes, rotation): <https://www.upwork.com/developer/keys/>

## Where scopes live

**Scopes are configured on the API key itself in the Upwork API Center — not passed as a `scope` query param in the authorize URL.**

From the Upwork docs:

> During the API key request process through the API Center, you are required to select the API Key scopes. At that point, your selection defines what APIs can be accessed by that specific API Key.
>
> Please note that the scope "Common Entities - Read-Only Access" will be required for all the cases.

Changing scopes on an existing key **invalidates all tokens previously issued against it**. You must re-run the OAuth flow afterward.

## Permission error signature

When the API key lacks a scope needed for a field, the API returns HTTP 200 with:

```json
{
  "errors": [
    {
      "message": "The client or authentication token doesn't have enough oauth2 permissions/scopes to access: [Money.currency, Money.rawValue, PageInfo.endCursor, PageInfo.hasNextPage].",
      "extensions": { "classification": "ExecutionAborted" }
    }
  ]
}
```

The message lists the exact field paths that are blocked.

## Scopes this project requires

- **Common Entities - Read-Only Access** (required for every API call)
- **Read marketplace Job Postings** (required for `marketplaceJobPostingsSearch`, including `Money`, `PageInfo`, and nested `client`/`occupations`/`skills` field reads)

If more than those two get added later (e.g. to read contract terms or detailed job bodies via `marketplaceJobPosting`), enable the relevant read-only scope in the API Center and re-authorize.
