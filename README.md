# Django Sastry (django-sastry)

A lightweight, zero-configuration dynamic CRUD administration interface and interactive visual **Entity Relations (ER) Diagram** engine for Django.

---

## Highlights & Features

1. **Interactive Visual Entity Relations (ER) Diagram**:
   - **Right-Anchored Selected Model**: The active selected table is anchored to the extreme right, directly adjacent to the field inspector panel, with incoming reverse relations (`has_many` / child tables in cyan) and outgoing foreign key targets (in warm tones) plotted across vertical columns to the left.
   - **Reactive Schema Navigation**: Click any table card or foreign key to immediately make it the active model and move it to the right, refreshing all its upstream and downstream relations.
   - **Multi-Column Bin-Packing**: Automatically distributes child and referenced tables across vertical columns to the left to prevent tall single-column spillover for heavily connected models.
   - **Vector Connection Canvas**: Color-coded relational links with directional arrowheads for child table reverse relations and circular anchor nodes for foreign key targets.
   - **Field-Level Inspector**: Click any field in the active table to view its verbose name, Django internal type, nullability, blankness, uniqueness, database indexes, and reverse references.

2. **Zero-Config Dynamic CRUD**:
   - Instant spreadsheet-style data grid for all registered Django models without requiring boilerplate `admin.py` registrations.
   - Paginated browsing, multi-field filtering, search, and inline record creation/editing.
   - Safe foreign key resolution with query limits preventing unbounded database loads.

3. **Lightweight & Non-Intrusive**:
   - Introspects model structure using Django's native `Model._meta` APIs in memory with zero database queries during diagram generation.
   - Zero external frontend dependencies: built with modern vanilla ES6 JavaScript and HTML5 Canvas.

---

## Installation

Install via pip:

```bash
pip install django-sastry
```

Or install directly from GitHub:

```bash
pip install git+https://github.com/krishnamurthy/django-sastry.git
```

---

## Quickstart

### 1. Add to `INSTALLED_APPS`

In your Django `settings.py`:

```python
INSTALLED_APPS = [
    # ...
    "sastry",
]
```

### 2. Include URLs

In your project's root `urls.py`:

```python
from django.urls import path, include

urlpatterns = [
    # ...
    path("sastry/", include("sastry.urls")),
]
```

### 3. Access the Interfaces

Start your development server:

```bash
python manage.py runserver
```

- **Visual ER Diagram**: Navigate to `http://127.0.0.1:8000/sastry/er/`
- **Dynamic CRUD Grid**: Navigate to `http://127.0.0.1:8000/sastry/`

---

## Security & Permissions

Access to `/sastry/` and `/sastry/er/` requires standard administrator authentication:
- `request.user.is_superuser` or `request.user.is_admin` must evaluate to `True`.
- Non-administrators receive an HTTP 403 Forbidden response.

---

## License

MIT License. Developed by Krishnamurthy (Global Multimedia).
Contributions and feature suggestions are welcome!

