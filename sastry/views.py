from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login


def signin(request):
    if request.method == 'POST' and 'email' in request.POST and 'password' in request.POST:
        email = request.POST['email']
        password = request.POST['password']
        user = authenticate(request, username=email, password=password)
        if not user:
            msg = "Invalid email ID or password. Retry"
        else:
            login(request, user)
            if 'role' in request.session:
                request.session.pop('role')
            if user.is_staff and 'next' in request.POST:
                return redirect(request.POST['next'])
            return redirect('/')
    else:
        msg = "Enter login information"
    return render(request,
                  's_loginPage.html',
                  {
                      'menu': msg,
                      'next': request.GET['next'] if 'next' in request.GET else '/'
                  })
