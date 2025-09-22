dev2-compose:
	docker-compose --env-file .env.dev2 -f docker/docker-compose.dev2.yml up -d

dev-compose:
	docker-compose --env-file .env.dev -f docker/docker-compose.dev.yml up -d

hasura_apply:
	docker compose --env-file .env.dev2 exec console \
		sh -c "hasura-cli metadata apply --endpoint=http://graphql:8080 && \
					 hasura-cli migrate apply --database-name 'default' --endpoint=http://graphql:8080"
dev:
	make dev-compose
	pnpm run dev

prod:
	docker-compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d --build --force-recreate

prod-back:
	docker-compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d backend --build --force-recreate
