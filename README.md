데이터베이스 및 엔티티

친구 요청(또는 친구 관계)을 나타내는 Friendship 엔티티(상태: pending, accepted, rejected)를 추가
1:1 채팅을 위해 Chat 엔티티에 chatType(‘group’ 또는 ‘private’)와 참여자(participants) 관계를 추가
백엔드 (NestJS)

FriendsModule: 친구 요청 보내기, 수락, 거절, 요청 목록 및 친구 목록 조회 API
ChatsModule: 기존 그룹 채팅 외에 1:1(개인) 채팅을 위한 getOrCreatePrivateChat API 추가
필요한 의존성(예: UsersModule, TypeORM 모듈) 임포트 및 순환 의존성 처리
