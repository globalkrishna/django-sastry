from django.urls import path
import sastry.dbadmin

urlpatterns = [
    path('', sastry.dbadmin.index, name='dbAdmin'),
    path('index/', sastry.dbadmin.index, name='dbAdmin'),
    path('er/', sastry.dbadmin.er_view, name='er_view'),
    path('er/api/<str:app_label>/<str:model_name>/', sastry.dbadmin.er_schema_api, name='er_schema_api'),
    path('<str:app>/<str:mdl>/<str:dat>/', sastry.dbadmin.model, name='GET or POST Model'),
]
