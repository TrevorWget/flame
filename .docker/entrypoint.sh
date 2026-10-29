#!/bin/sh
# Runs as the image's non-root "node" user (1000:1000) by default, or as any --user UID:GID.
# When the container is started as root (--user 0:0), Flame is run as PUID:PGID instead:
# ownership of the data directory is fixed and the Docker socket's group is joined first.
set -eu

DATA_DIR=/app/data
DOCKER_SOCK=/var/run/docker.sock

log() {
  echo "[entrypoint] $*"
}

fail() {
  echo "[entrypoint] ERROR: $*" >&2
  exit 1
}

run_as_root() {
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"

  case "$PUID" in '' | *[!0-9]*) fail "PUID must be a numeric user id (got '$PUID')" ;; esac
  case "$PGID" in '' | *[!0-9]*) fail "PGID must be a numeric group id (got '$PGID')" ;; esac

  if [ "$PUID" = 0 ]; then
    log "WARNING: PUID=0, running Flame as root"
    exec "$@"
  fi

  sed -i "s/^node:x:[0-9]*:[0-9]*:/node:x:$PUID:$PGID:/" /etc/passwd
  sed -i "s/^node:x:[0-9]*:/node:x:$PGID:/" /etc/group

  mkdir -p "$DATA_DIR"

  # Only touch entries that are wrong, so restarts don't rewrite every inode (slow or
  # impossible on NFS with root_squash, where a failure must not stop the container)
  if [ -n "$(find "$DATA_DIR" \( ! -user "$PUID" -o ! -group "$PGID" \) | head -n 1)" ]; then
    log "Changing ownership of $DATA_DIR to $PUID:$PGID"
    find "$DATA_DIR" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown "$PUID:$PGID" {} + ||
      log "WARNING: could not change ownership of every file in $DATA_DIR"
  fi

  if [ -S "$DOCKER_SOCK" ]; then
    sock_gid="$(stat -c %g "$DOCKER_SOCK")"
    sock_group="$(awk -F: -v gid="$sock_gid" '$3 == gid { print $1; exit }' /etc/group)"

    if [ -z "$sock_group" ]; then
      sock_group="docker-sock-$sock_gid"
      addgroup -g "$sock_gid" "$sock_group"
    fi

    addgroup node "$sock_group" 2>/dev/null || true
  fi

  exec su-exec node "$@"
}

check_permissions() {
  uid="$(id -u)"
  gid="$(id -g)"

  [ -d "$DATA_DIR" ] || fail "$DATA_DIR does not exist"

  unwritable="$(find "$DATA_DIR" -maxdepth 1 | while IFS= read -r path; do
    [ -w "$path" ] || echo "  $path"
  done)"

  if [ -n "$unwritable" ]; then
    fail "Flame runs as uid=$uid gid=$gid and cannot write to:
$unwritable
Fix one of:
  - give the host directory to that user:   sudo chown -R $uid:$gid /path/to/data
  - run as the directory's owner:          --user UID:GID   (compose: user: \"UID:GID\")
  - start as root and let Flame fix it:    --user 0:0 -e PUID=$uid -e PGID=$gid"
  fi

  if [ -S "$DOCKER_SOCK" ] && ! { [ -r "$DOCKER_SOCK" ] && [ -w "$DOCKER_SOCK" ]; }; then
    sock_gid="$(stat -c %g "$DOCKER_SOCK")"
    log "WARNING: uid=$uid cannot use $DOCKER_SOCK, so the Docker integration will not work." \
      "Add the socket's group: --group-add $sock_gid (compose: group_add: [\"$sock_gid\"])"
  fi
}

if [ "$(id -u)" = 0 ]; then
  run_as_root "$@"
fi

check_permissions
exec "$@"
