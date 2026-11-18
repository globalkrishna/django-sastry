# Changelog

All notable changes to `django-sastry` are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.6] - 2026-11-18

### Dark Mode Modal Styling for ManyToMany
- **Improved**:
  - Restyled ManyToMany modal and inline multi-select containers to seamlessly adhere to dark mode (`[data-bs-theme="dark"]`).
  - Replaced hardcoded white background containers with theme-adaptive styling (`#111418` dark slate) and high-contrast labels (`#e6edf3`).
  - Added subtle hover highlights (`#212730`), active checked state highlights, and clickable option rows.
  - Enhanced search input and modal dialog border contrast.

---

## [2.0.5] - 2026-11-18

### Unsaved Instance ManyToMany Access Fix
- **Fixed**:
  - Resolved `ValueError: "<Model: Model #None>" needs to have a value for field "id" before this many-to-many relationship can be used` when opening models with `ManyToManyField` (such as `app.User`).
  - Removed instance-level M2M descriptor evaluations in `base_cru.html`; checkbox state continues to be cleanly and dynamically synchronized on the client by `s_crud.ts`.

---

## [2.0.4] - 2026-11-18

### Form Foreign Key Optimization & Crash Protection
- **Fixed**:
  - Prevented infinite hang and DOM freezing on models with foreign keys to high-volume transaction tables (e.g. `VoucherItem` with 500k+ rows) when `max_limit=None`.
  - Introduced a `safety_threshold` (10,000 items) in `optimize_form_querysets`: standard and master models (such as `Customer` with 3,800+ records, `Product`, `Vendor`, etc.) load all choices without truncation, while massive transaction tables safely load `used_ids` plus recent records.
  - Automatically applied `select_related` on ForeignKey target models to prevent N+1 queries during option label rendering (such as `Customer.__str__` accessing `state.name`).

---

## [2.0.3] - 2026-11-18

### ManyToMany Multi-Selection & Permission Management
- **Added**:
  - Full `ManyToManyField` support in Sastry Dynamic CRUD:
    - Searchable multi-selection UI with live text filtering, "Select All", and "Clear" controls.
    - Inline badge pills displaying selected items with compact count badges for large collections.
    - Single-cell modal editing for ManyToMany fields with live count badges and interactive checkboxes.
    - Pre-fetching (`prefetch_related`) on queries to prevent N+1 queries when loading multi-select rows.
    - Automatic `set()` synchronization on POST updates and new instance creation.
    - Full support for `auth.Group.permissions` and related M2M relations across Django models.
  - Interactive ER Diagram cards now display `ManyToManyField` with distinct badges and connecting relations.

---

## [2.0.2] - 2026-11-17

### Form Foreign Key Selection Fix
- **Fixed**:
  - Removed arbitrary `1,000` item limit on ForeignKey selection querysets (`optimize_form_querysets`), ensuring all available records (e.g. all customers, vendors, accounts) appear in dropdowns without artificial truncation.
  - When optional limits are configured, ordering defaults to `-pk` to prioritize newest records.

---

## [2.0.1] - 2026-11-15

### Documentation & Packaging Refinement
- **Documentation**:
  - Added dedicated Multi-Tenant SaaS quickstart guide and annotated `SASTRY_MULTI_TENANT` configuration block directly to `README.md`.
  - Added full API reference for `sastry.tenant.TenantManager` in `docs/USER_MANUAL.md`.
  - Updated Table of Contents and security policy documentation to reflect multi-tenant authorization modes.
- **Packaging**:
  - Ensured PEP-compliant `PKG-INFO` injection for source distributions (`sdist`).

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

