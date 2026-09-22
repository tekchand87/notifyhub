# Temporary EC2 Kafka deployment

This deployment is for the single EC2 demo broker at `13.207.193.82`. It uses
the same `apache/kafka:4.0.1` image and KRaft configuration as NotifyHub's
local Docker Kafka, but it is isolated in `docker-compose.kafka-ec2.yml`.

The broker has three client listeners:

- `kafka:29092` (`INTERNAL`) is internal to the Docker network and is not
  published on the EC2 host. Used for container-to-container traffic only.
- `${KAFKA_PUBLIC_HOST}:9092` (`EXTERNAL`) is published on the EC2 host and
  advertises the public IP. Used by Mac / local development clients.
- `${KAFKA_PRIVATE_HOST}:9094` (`PRIVATE`) is published on the EC2 host but
  must only be reachable from within the VPC. Advertises the EC2 private IP
  (`10.0.1.118`) so ECS API and Worker tasks receive a VPC-routable broker
  address in Kafka metadata responses. **Do not open port 9094 to
  `0.0.0.0/0`** — restrict it to the ECS task security group.

The controller listener remains container-only. Kafka data is stored in the
named Docker volume `notifyhub_kafka_ec2_data`.

## Prepare the EC2 host

Run these commands on Ubuntu EC2 after cloning or copying the repository:

```bash
cd ~/notifyhub
cp deploy/kafka-ec2.env.example .env.kafka-ec2
chmod 600 .env.kafka-ec2
```

If the instance receives a different public IP after replacement, update both
`KAFKA_PUBLIC_HOST` and `KAFKA_BROKERS` in the untracked env file. The
application source remains unchanged.

## Start Kafka

```bash
cd ~/notifyhub
docker compose --env-file .env.kafka-ec2 -f docker-compose.kafka-ec2.yml up -d
docker compose --env-file .env.kafka-ec2 -f docker-compose.kafka-ec2.yml ps
```

## Stop Kafka safely

`stop` preserves the container and named volume:

```bash
cd ~/notifyhub
docker compose --env-file .env.kafka-ec2 -f docker-compose.kafka-ec2.yml stop kafka
```

Start it again with the start command above. Do not remove the named volume for
this demo unless the Kafka data is intentionally disposable.

## View logs

```bash
cd ~/notifyhub
docker compose --env-file .env.kafka-ec2 -f docker-compose.kafka-ec2.yml logs -f --tail=200 kafka
```

## Verify that port 9092 is listening

On the EC2 host:

```bash
sudo ss -ltnp | grep ':9092 '
docker compose --env-file .env.kafka-ec2 -f docker-compose.kafka-ec2.yml ps
docker compose --env-file .env.kafka-ec2 -f docker-compose.kafka-ec2.yml exec kafka \
  /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

From a NotifyHub client host, verify the security-group/network path without
installing extra software:

```bash
nc -vz 13.207.193.82 9092
```

TCP reachability alone does not prove Kafka metadata is correct; the broker API
command and a real KafkaJS client connection verify the Kafka protocol path.

## Create the NotifyHub topics

Run on the EC2 host. The commands are idempotent because they use
`--if-not-exists`:

```bash
cd ~/notifyhub
docker compose --env-file .env.kafka-ec2 -f docker-compose.kafka-ec2.yml exec kafka \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --if-not-exists --topic notifyhub.events \
  --partitions 6 --replication-factor 1

docker compose --env-file .env.kafka-ec2 -f docker-compose.kafka-ec2.yml exec kafka \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --if-not-exists --topic notifyhub.events.dlq \
  --partitions 1 --replication-factor 1
```

Verify topic names and partition counts:

```bash
docker compose --env-file .env.kafka-ec2 -f docker-compose.kafka-ec2.yml exec kafka \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

docker compose --env-file .env.kafka-ec2 -f docker-compose.kafka-ec2.yml exec kafka \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic notifyhub.events

docker compose --env-file .env.kafka-ec2 -f docker-compose.kafka-ec2.yml exec kafka \
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic notifyhub.events.dlq
```

Expected partition counts are 6 and 1 respectively. The NotifyHub worker will
validate these topics before consuming with group `notifyhub-workers`.

## Configure NotifyHub clients

### Mac / local development

Uses the public listener on port `9092`. Inject these values into the local
`.env` file (not into application source):

```text
KAFKA_BROKERS=43.205.206.108:9092
KAFKA_SSL=false
KAFKA_SASL_MECHANISM=
KAFKA_SASL_USERNAME=
KAFKA_SASL_PASSWORD=
KAFKA_TOPIC=notifyhub.events
KAFKA_DLQ_TOPIC=notifyhub.events.dlq
KAFKA_GROUP_ID=notifyhub-workers
```

### ECS API / Worker (Fargate)

Uses the private VPC listener on port `9094`. The ECS task definition or
Parameter Store must supply these values:

```text
KAFKA_BROKERS=10.0.1.118:9094
KAFKA_SSL=false
KAFKA_SASL_MECHANISM=
KAFKA_SASL_USERNAME=
KAFKA_SASL_PASSWORD=
KAFKA_TOPIC=notifyhub.events
KAFKA_DLQ_TOPIC=notifyhub.events.dlq
KAFKA_GROUP_ID=notifyhub-workers
```

Port `9094` is VPC-internal only. The EC2 security group inbound rule for
`9094` must use the ECS task security group ID as its source — never
`0.0.0.0/0`. Port `9092` rules remain unchanged for public clients.

This is a temporary plaintext demo deployment. For production, use private
networking and authenticated/TLS Kafka rather than exposing plaintext Kafka.
