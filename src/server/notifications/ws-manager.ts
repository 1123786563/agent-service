type NotificationPayload = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type ClientSocket = {
  send: (data: string) => void;
  readyState: number;
};

const OPEN_STATE = 1;

const userConnections = new Map<string, Set<ClientSocket>>();

export function addConnection(userId: string, socket: ClientSocket) {
  let connections = userConnections.get(userId);
  if (!connections) {
    connections = new Set();
    userConnections.set(userId, connections);
  }
  connections.add(socket);
}

export function removeConnection(userId: string, socket: ClientSocket) {
  const connections = userConnections.get(userId);
  if (connections) {
    connections.delete(socket);
    if (connections.size === 0) {
      userConnections.delete(userId);
    }
  }
}

export function sendNotificationToUser(
  userId: string,
  notification: NotificationPayload
) {
  const connections = userConnections.get(userId);
  if (!connections) return;

  const message = JSON.stringify({
    event: "notification",
    data: notification
  });

  for (const socket of connections) {
    if (socket.readyState === OPEN_STATE) {
      socket.send(message);
    }
  }
}

export function getOnlineUserCount() {
  return userConnections.size;
}
