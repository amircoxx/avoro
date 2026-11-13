# Remove Dummy Marketplace Data Design

## Goal

Show only real tech profiles returned by the API. Remove the static artist fixture and all customer-facing sample profile cards and testimonials.

## Data flow

`mapTechProfileToArtist` will build a complete display model from `PublicTechProfile` values and neutral presentation defaults. It will not import or fall back to any static profile record. Discover and profile pages continue to obtain data through the existing API and facades.

## Landing page

The landing page will no longer render hardcoded artist cards, names, locations, ratings, or quotes. Its marketplace CTA remains and uses neutral copy so it does not imply profiles that do not exist.

## Error handling and testing

An incomplete real profile will still render safely with neutral labels, empty media lists, and no invented review data. Unit coverage will prove the mapper does not depend on fixture data; the frontend build and dummy-data scan will verify the shipped code.
