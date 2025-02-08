interface SuccessResponse<T = any> {
  success: true;
  message: string;
  data: T;
}

interface FailResponse {
  success: false;
  message: string;
}

// responseObj의 타입 정의
export interface ResponseObjType {
  success: <T = any>(data?: T, message?: string) => SuccessResponse<T>;
  fail: (message?: string) => FailResponse;
}

/** success 이면서 reture 할 데이터가 없을때 = null 입력 */
export const responseObj = {
  success: (data: any = {}, message: string = 'OK') => {
    return {
      success: true,
      message,
      data,
    };
  },
  fail: (message: string = 'fail') => {
    return {
      success: false,
      message,
    };
  },
};
