# Changelog

All notable changes to `django-sastry` are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2026-11-15

### Major Architectural Milestone: Native Multi-Tenant SaaS Engine
This major release transforms `django-sastry` from a single-tenant administrative utility into a turnkey **Multi-Tenant SaaS Backplane & Schema Visualization Framework**.

#### Added
- **Native Multi-Tenant Engine (`sastry.tenant.TenantManager`)**:
  - Automatic identity detection from request context (`request.store`, `request.tenant`, `request.organization`, or custom resolver).
  - Config-driven activation via `SASTRY_MULTI_TENANT` in Django `settings.py`.
- **Automatic Row-Level Security & Scoping**:
  - Automatically injects tenant foreign key filters (`store_id`, `tenant_id`, etc.) into `getData` queries.
  - Guarantees zero data leakage between tenants or stores without manual view boilerplate.
- **Model Whitelisting & Gatekeeping**:
  - Exposes permitted business models (e.g. `inventory`, `billing`) to tenant store staff.
  - Automatically forbids and omits sensitive platform models (`Tenant`, `Store`, `User`, `Session`, `Permission`).
- **Safe Mutations & Auto-Stamping**:
  - Automatically stamps the active tenant foreign key on newly created records in the Sastry data grid.
  - Enforces tenant ownership checks on inline updates and deletions to prevent ID spoofing.
- **Foreign Key Choice Scoping**:
  - Related dropdown choices in form modals (`optimize_form_querysets`) are dynamically scoped to the tenant.
- **Scoped Visual ER Diagrams**:
  - `/sastry/er/` visualizes entity relationships strictly for permitted tenant models.
- **Comprehensive Unit Test Suite**:
  - Added `SastryTenantTests` covering access control, query filter injection, model whitelisting, and backward compatibility.

#### Maintained
- **100% Backward Compatibility**:
  - When `SASTRY_MULTI_TENANT` is omitted or `ENABLED: False`, Sastry operates identically to v1.x with zero overhead.

---

## [1.0.7] - 2026-11-14
### Fixed
- Fixed canvas tainting on PNG export using pure vector SVG mode in ER diagram.

## [1.0.6] - 2026-11-14
### Added
- Interactive card dragging, crow's foot relational notation, SVG and PNG export, touch gestures.

## [1.0.5] - 2026-11-12
### Added
- Multi-column right-to-left bin packing layout with selected model right-anchored.
- Vector connection lines with directional arrowheads.

## [1.0.0] - 2026-11-11
### Initial Release
- Dynamic spreadsheet-style CRUD data grid for Django models.
- Interactive ER schema introspection.

