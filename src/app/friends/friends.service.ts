import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friendship, FriendshipStatus } from '../../entities/friend.entity';
import { Users } from '../../entities/users.entity';
import { TokenUserInfo } from 'src/types/requestWithUser.types';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friendship)
    private friendshipRepository: Repository<Friendship>,
  ) {}

  async sendFriendRequest(
    requester: TokenUserInfo,
    receiverId: string,
  ): Promise<Friendship> {
    if (requester.id === receiverId) {
      throw new BadRequestException('자기 자신에게 요청할 수 없습니다.');
    }
    // 이미 요청이 있거나 친구 관계가 형성된 경우 체크 (관계는 id만 사용하여 JWT payload의 iat/exp가 엔티티에 전달되지 않도록 함)
    const existing = await this.friendshipRepository.findOne({
      where: [
        { requester: { id: requester.id }, receiver: { id: receiverId } },
        { requester: { id: receiverId }, receiver: { id: requester.id } },
      ],
    });
    if (existing) {
      throw new BadRequestException('이미 친구 요청이 있거나 친구입니다.');
    }

    const friendship = this.friendshipRepository.create({
      requester: { id: requester.id } as Users,
      receiver: { id: receiverId } as Users,
      status: FriendshipStatus.PENDING,
    });
    return this.friendshipRepository.save(friendship);
  }

  async acceptFriendRequest(
    requestId: number,
    user: TokenUserInfo,
  ): Promise<Friendship> {
    const friendship = await this.friendshipRepository.findOne({
      where: { id: requestId, receiver: { id: user.id } },
    });
    if (!friendship) {
      throw new NotFoundException('친구 요청을 찾을 수 없습니다.');
    }
    friendship.status = FriendshipStatus.ACCEPTED;
    return this.friendshipRepository.save(friendship);
  }

  async rejectFriendRequest(
    requestId: number,
    user: TokenUserInfo,
  ): Promise<Friendship> {
    const friendship = await this.friendshipRepository.findOne({
      where: { id: requestId, receiver: { id: user.id } },
    });
    if (!friendship) {
      throw new NotFoundException('친구 요청을 찾을 수 없습니다.');
    }
    friendship.status = FriendshipStatus.REJECTED;
    return this.friendshipRepository.save(friendship);
  }

  async getFriendRequests(user: TokenUserInfo): Promise<Friendship[]> {
    return this.friendshipRepository.find({
      where: { receiver: { id: user.id }, status: FriendshipStatus.PENDING },
    });
  }

  async getFriends(user: TokenUserInfo): Promise<Users[]> {
    const friendships = await this.friendshipRepository.find({
      where: [
        { requester: { id: user.id }, status: FriendshipStatus.ACCEPTED },
        { receiver: { id: user.id }, status: FriendshipStatus.ACCEPTED },
      ],
    });
    const friends: Users[] = friendships.map((f) =>
      f.requester.id === user.id ? f.receiver : f.requester,
    );
    return friends;
  }
}
