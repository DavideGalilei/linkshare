FROM python:3.10

WORKDIR /code

RUN curl -sSL https://install.python-poetry.org | python3 -

COPY ./requirements.txt /code/requirements.txt

RUN poetry install

COPY ./app /code/app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80", "--proxy-headers"]
