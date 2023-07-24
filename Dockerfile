FROM python:3.10
ENV PYTHONUNBUFFERED=1

WORKDIR /code

RUN curl -sSL https://install.python-poetry.org | python -

COPY pyproject.toml /code/
COPY poetry.lock /code/

RUN pip install poetry
RUN poetry export --without-hashes --format=requirements.txt > requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

COPY . /code/

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80", "--proxy-headers", "--forwarded-allow-ips", "*"]
