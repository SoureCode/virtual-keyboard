FROM debian:stable-slim

ARG USERNAME
ARG USER_UID=1000
ARG USER_GID=${USER_UID}

ENV DEBIAN_FRONTEND=noninteractive
ENV DEVCONTAINER=true

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        sudo ca-certificates curl git openssh-client && \
    apt-get clean && rm -rf /var/lib/apt/lists/* && \
    userdel -r ubuntu 2>/dev/null || true && \
    groupadd --gid "${USER_GID}" "${USERNAME}" && \
    useradd --uid "${USER_UID}" --gid "${USER_GID}" --create-home --shell /bin/bash "${USERNAME}" && \
    echo "${USERNAME} ALL=(ALL) NOPASSWD:ALL" >/etc/sudoers.d/"${USERNAME}" && \
    chmod 0440 /etc/sudoers.d/"${USERNAME}"

USER ${USERNAME}
