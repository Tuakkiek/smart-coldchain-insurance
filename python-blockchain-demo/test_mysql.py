from database import get_db_connection


def main():
    try:
        connection = get_db_connection()

        print("Kết nối Aiven MySQL thành công!")
  
    except Exception as error:
        print("Kết nối MySQL thất bại!")
        print("Lỗi:", error)

if __name__ == "__main__":
    main()
