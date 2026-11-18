from django.urls import path
import sastry.dbadmin

urlpatterns = [
    path('', sastry.dbadmin.index, name='dbAdmin'),
    path('index/', sastry.dbadmin.index, name='dbAdmin'),
    path('er/', sastry.dbadmin.er_view, name='er_view'),
    path('er/api/<str:app_label>/<str:model_name>/', sastry.dbadmin.er_schema_api, name='er_schema_api'),
    path('autocomplete/<str:app>/<str:mdl>/', sastry.dbadmin.autocomplete_api, name='sastry_autocomplete_api'),
    path('action/<str:app>/<str:mdl>/<str:action_name>/', sastry.dbadmin.model_action_api, name='sastry_model_action_api'),
    path('<str:app>/<str:mdl>/<str:dat>/', sastry.dbadmin.model, name='GET or POST Model'),
    path('<str:app>/<str:mdl>/<str:dat>', sastry.dbadmin.model),
    path('<str:app>/<str:mdl>/', sastry.dbadmin.model, {'dat': '{}'}),
    path('<str:app>/<str:mdl>', sastry.dbadmin.model, {'dat': '{}'}),
]
